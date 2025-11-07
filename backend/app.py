import json
import base64
import logging
import os
import time
from urllib.parse import unquote
import uuid
import requests
from werkzeug.utils import secure_filename

from azure.identity import ManagedIdentityCredential, AzureCliCredential, ChainedTokenCredential
from azure.storage.blob import BlobServiceClient
from dotenv import load_dotenv
from flask import Flask, Response, jsonify, request, session, redirect, url_for
from flask_cors import CORS
import msal
from flask_session import Session
from werkzeug.middleware.proxy_fix import ProxyFix

# Import the asynchronous secret retrieval function
from keyvault import get_secret

load_dotenv()

# Helper functions for reading environment variables
def read_env_variable(var_name, default=None):
    value = os.getenv(var_name, default)
    return value.strip() if value else default

def read_env_list(var_name):
    value = os.getenv(var_name, "")
    return [item.strip() for item in value.split(",") if item.strip()]

def read_env_boolean(var_name, default=False):
    value = os.getenv(var_name, str(default)).strip().lower()
    return value in ['true', '1', 'yes']

# Read Environment Variables
SPEECH_REGION = read_env_variable('SPEECH_REGION')
ORCHESTRATOR_ENDPOINT = read_env_variable('ORCHESTRATOR_ENDPOINT')
STORAGE_ACCOUNT = read_env_variable('STORAGE_ACCOUNT')
LOGLEVEL = read_env_variable('LOGLEVEL', 'INFO').upper()
UPLOAD_CONTAINER = read_env_variable('AZURE_STORAGE_CONTAINER_NAME', 'documents').lower()

# MSAL / OIDC configuration for custom authentication
ENABLE_AUTHENTICATION = read_env_boolean('ENABLE_AUTHENTICATION')
FORWARD_ACCESS_TOKEN_TO_ORCHESTRATOR = read_env_boolean('FORWARD_ACCESS_TOKEN_TO_ORCHESTRATOR')
OTHER_AUTH_SCOPES = read_env_list('OTHER_AUTH_SCOPES')
CLIENT_ID = os.getenv("CLIENT_ID", "your_client_id")
APP_SERVICE_CLIENT_SECRET_NAME = os.getenv("APP_SERVICE_CLIENT_SECRET_NAME", "appServiceClientSecretKey")
FLASK_SECRET_KEY_NAME = os.getenv("FLASK_SECRET_KEY_NAME", "flaskSecretKey")
AUTHORITY = os.getenv("AUTHORITY", "https://login.microsoftonline.com/your_tenant_id")
REDIRECT_PATH = os.getenv("REDIRECT_PATH", "/getAToken")  # Must match the Azure AD app registration redirect URI.
SCOPE = [
    "User.Read"
]

# Authorization settings
ALLOWED_GROUP_NAMES = read_env_list('ALLOWED_GROUP_NAMES')
ALLOWED_USER_PRINCIPALS = read_env_list('ALLOWED_USER_PRINCIPALS')
ALLOWED_USER_NAMES = read_env_list('ALLOWED_USER_NAMES')

SPEECH_RECOGNITION_LANGUAGE = read_env_variable('SPEECH_RECOGNITION_LANGUAGE')
SPEECH_SYNTHESIS_LANGUAGE = read_env_variable('SPEECH_SYNTHESIS_LANGUAGE')
SPEECH_SYNTHESIS_VOICE_NAME = read_env_variable('SPEECH_SYNTHESIS_VOICE_NAME')

# Set logging
logging.basicConfig(level=LOGLEVEL)

# ------------------------------------------------------------------------------
# Load secrets from Key Vault using the asynchronous function at startup.
# This avoids having to call asyncio.run() repeatedly in your helper functions.
# ------------------------------------------------------------------------------
FLASK_SECRET_KEY =  get_secret(FLASK_SECRET_KEY_NAME)
APP_SERVICE_CLIENT_SECRET = get_secret(APP_SERVICE_CLIENT_SECRET_NAME)

# Obtain the token using Managed Identity
def get_managed_identity_token():
    credential = ChainedTokenCredential(
        ManagedIdentityCredential(),
        AzureCliCredential()
    )
    token = credential.get_token("https://management.azure.com/.default").token
    return token

def get_function_key():
    subscription_id = os.getenv('AZURE_SUBSCRIPTION_ID')
    resource_group = os.getenv('AZURE_RESOURCE_GROUP_NAME')
    function_app_name = os.getenv('AZURE_ORCHESTRATOR_FUNC_NAME')
    token = get_managed_identity_token()
    logging.info("[webbackend] Obtaining function key.")
    
    # URL to get all function keys, including the default one
    requestUrl = f"https://management.azure.com/subscriptions/{subscription_id}/resourceGroups/{resource_group}/providers/Microsoft.Web/sites/{function_app_name}/functions/orc/listKeys?api-version=2022-03-01"
    
    requestHeaders = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }
    
    response = requests.post(requestUrl, headers=requestHeaders)
    response_json = json.loads(response.content.decode('utf-8'))
    
    try:
        # Assuming you want to get the 'default' key
        function_key = response_json['default']
    except KeyError as e:
        function_key = None
        logging.error(f"[webbackend] Error when getting function key. Details: {str(e)}.")
    
    return function_key

app = Flask(__name__)
CORS(app)

# Use the asynchronously retrieved Flask secret key
app.secret_key = FLASK_SECRET_KEY

# Configure server-side session storage
app.wsgi_app = ProxyFix(app.wsgi_app, x_proto=1, x_host=1)
app.config["SESSION_TYPE"] = "filesystem"
app.config["SESSION_FILE_DIR"] = "./flask_session_files"
app.config["SESSION_PERMANENT"] = False
app.config["PREFERRED_URL_SCHEME"] = "https"
Session(app)

# --- Helper function to obtain a valid (refreshed) access token ---
def get_valid_access_token(scopes):
    cache = _load_cache()
    msal_app = _build_msal_app(cache=cache)
    accounts = msal_app.get_accounts()
    account = accounts[0] if accounts else None
    result = msal_app.acquire_token_silent(scopes, account=account)
    if not result:
        raise Exception("Could not refresh token silently: no token found in cache.")
    if "error" in result:
        raise Exception(result.get("error_description", "Could not refresh token silently."))
    _save_cache(cache)
    return result.get("access_token")

# --- Authentication Endpoints ---
@app.route("/login")
def login():
    if not ENABLE_AUTHENTICATION:
        return redirect(url_for("index"))
    session["state"] = str(uuid.uuid4())
    auth_url = _build_auth_url(scopes=SCOPE, state=session["state"])
    return redirect(auth_url)

@app.route(REDIRECT_PATH)
def authorized():
    if not ENABLE_AUTHENTICATION:
        return redirect(url_for("index"))
    
    if request.args.get("state") != session.get("state"):
        return redirect(url_for("index"))
    if "error" in request.args:
        return f"Error: {request.args.get('error_description')}", 400
    
    if request.args.get("code"):
        logging.info("[webbackend] Attempting to acquire token for user.")        
        cache = _load_cache()
        result = _build_msal_app(cache=cache).acquire_token_by_authorization_code(
            request.args["code"],
            scopes=SCOPE,
            redirect_uri=url_for("authorized", _external=True)
        )
        if "error" in result:
            logging.warning(f"Could not acquire token for user. Error: {result.get('error_description')}")
            return f"Login failure: {result.get('error_description')}", 400
        
        session["user"] = result.get("id_token_claims")
        session["graph_access_token"] = result.get("access_token")
        session["refresh_token"] = result.get("refresh_token")
        _save_cache(cache)

    if OTHER_AUTH_SCOPES:
        logging.info("[webbackend] Attempting to acquire token for other scopes.")
        try:
            other_access_token = get_valid_access_token(OTHER_AUTH_SCOPES)
            session["other_access_token"] = other_access_token
        except Exception as ex:
            logging.warning(f"Could not acquire token for other scopes {OTHER_AUTH_SCOPES}. Error: {str(ex)}")
            return f"Other scopes token acquisition failure: {str(ex)}", 400

    return redirect(url_for("index"))

@app.route("/logout")
def logout():
    if ENABLE_AUTHENTICATION:
        session.clear()
        return redirect(
            AUTHORITY + "/oauth2/v2.0/logout" +
            "?post_logout_redirect_uri=" + url_for("index", _external=True)
        )
    else:
        return redirect(url_for("index"))

def _build_auth_url(scopes=None, state=None):
    return _build_msal_app().get_authorization_request_url(
        scopes or [],
        state=state or str(uuid.uuid4()),
        redirect_uri=url_for("authorized", _external=True)
    )

def _build_msal_app(cache=None):
    # Use the asynchronously retrieved client secret
    client_secret = APP_SERVICE_CLIENT_SECRET
    return msal.ConfidentialClientApplication(
        CLIENT_ID,
        authority=AUTHORITY,
        client_credential=client_secret,
        token_cache=cache
    )

def _load_cache():
    cache = msal.SerializableTokenCache()
    if session.get("token_cache"):
        cache.deserialize(session["token_cache"])
    return cache

def _save_cache(cache):
    if cache.has_state_changed:
        session["token_cache"] = cache.serialize()

# --- End Authentication Endpoints ---

@app.route("/")
def index():
    if ENABLE_AUTHENTICATION and not session.get("user"):
        return redirect(url_for("login"))
    return app.send_static_file("index.html")

@app.route("/<path:path>")
def static_files(path):
    return app.send_static_file(path)

def check_authorization():
    if not ENABLE_AUTHENTICATION:
        return {
            'authorized': True,
            'client_principal_id': 'no-auth',
            'client_principal_name': 'anonymous',
            'client_group_names': [],
            'access_token': None
        }
    
    user = session.get("user")
    if not user:
        logging.info("[webbackend] No user in session; user is not authenticated.")
        return {
            'authorized': False,
            'client_principal_id': None,
            'client_principal_name': None,
            'client_group_names': [],
            'access_token': None
        }
    
    client_principal_id = user.get("oid")
    client_principal_name = user.get("preferred_username") or user.get("upn")
    
    try:
        graph_access_token = get_valid_access_token(SCOPE)
        session["graph_access_token"] = graph_access_token
    except Exception as ex:
        logging.error(f"[webbackend] Failed to refresh Graph token: {str(ex)}")
        graph_access_token = session.get("graph_access_token", None)
    
    other_access_token = None
    if OTHER_AUTH_SCOPES:
        try:
            other_access_token = get_valid_access_token(OTHER_AUTH_SCOPES)
            session["other_access_token"] = other_access_token
        except Exception as ex:
            logging.error(f"[webbackend] Failed to refresh other scopes token: {str(ex)}")
            other_access_token = session.get("other_access_token", None)
    
    access_token = other_access_token if other_access_token else graph_access_token
    
    groups = []
    if graph_access_token:
        try:
            graph_headers = {'Authorization': f'Bearer {graph_access_token}'}
            graph_url = 'https://graph.microsoft.com/v1.0/me/memberOf'
            graph_response = requests.get(graph_url, headers=graph_headers)
            graph_response.raise_for_status()
            group_data = graph_response.json()
            groups = [group.get('displayName', 'missing-group-read-all-permission') for group in group_data.get('value', [])]
            logging.info(f"[webbackend] User groups from Graph API: {groups}")
        except Exception as e:
            logging.info(f"[webbackend] Failed to get user groups from Graph API: {e}")
    else:
        logging.info("[webbackend] No valid Graph access token available; cannot get user groups")
    
    authorized = True
    if ALLOWED_GROUP_NAMES or ALLOWED_USER_PRINCIPALS or ALLOWED_USER_NAMES:
        authorized = False
        if client_principal_name in ALLOWED_USER_NAMES:
            authorized = True
        elif client_principal_id in ALLOWED_USER_PRINCIPALS:
            authorized = True
        elif any(group in ALLOWED_GROUP_NAMES for group in groups):
            authorized = True
        if not authorized:
            logging.info("[webbackend] User is not in allowed groups or users.")
    
    return {
        'authorized': authorized,
        'client_principal_id': client_principal_id,
        'client_principal_name': client_principal_name,
        'client_group_names': groups,
        'access_token': access_token
    }

@app.route("/chatgpt", methods=["POST"])
def chatgpt():
    start_time = time.time()    
    time.sleep(7)
    response = {
            "id": "d45e68ec-8515-43ab-bd3c-8c99916ad0a2",
            "status": "Succeeded",
            "result": {
                "analyzerId": "auto-labeling-model-1758607386215-615",
                "apiVersion": "2025-05-01-preview",
                "createdAt": "2025-11-04T11:07:24Z",
                "warnings": [],
                "contents": [
                    {
                        "markdown": "![image](image)\n",
                        "fields": {
                            "CompanyName": {
                                "type": "string",
                                "valueString": "Toyota"
                            },
                            "CarColor": {
                                "type": "string",
                                "valueString": "Silver"
                            },
                            "Damage_severity": {
                                "type": "string",
                                "valueString": "Moderate"
                            },
                            "Model_name": {
                                "type": "string",
                                "valueString": "Corolla"
                            },
                            "Damage_annotation": {
                                "type": "string",
                                "valueString": "The rear bumper has a noticeable dent."
                            },
                            "Damage_classification": {
                                "type": "string",
                                "valueString": "Dent"
                            }
                        },
                        "kind": "document",
                        "startPageNumber": 1,
                        "endPageNumber": 1,
                        "unit": "pixel",
                        "pages": [
                            {
                                "pageNumber": 1,
                                "spans": []
                            }
                        ]
                    }
                ]
            },
            "usage": {
                "tokens": {
                    "contextualization": 1000,
                    "input": 395,
                    "output": 41
                }
            }
        }
    return jsonify(response)

    # Support both JSON and multipart/form-data
    logging.info(f"[webbackend] request.content_type check: {request.content_type}")
    if request.content_type and request.content_type.startswith("multipart/form-data"):
        conversation_id = request.form.get("conversation_id")
        question = request.form.get("query")
        logging.info(f"[webbackend] Inside to check file: {question}")
        file = request.files.get("file")
        logging.info(f"[webbackend] Inside to check file: {file}")
        overrides = request.form.get("overrides")
        try:
            overrides = json.loads(overrides) if overrides else None
        except Exception:
            overrides = None
    else:
        conversation_id = request.json["conversation_id"]
        question = request.json["query"]
        file = None

    logging.info("[webbackend] conversation_id: " + conversation_id)    
    logging.info("[webbackend] question: " + question)
    logging.info("[webbackend] file: " + str(file))
    auth_info = check_authorization()
    
    if not auth_info['authorized']:
        response = {
            "answer": "You are not authorized to access this service. Please contact your administrator.",
            "thoughts": "The user attempted to access the service but is not part of any authorized users or groups.",
            "conversation_id": conversation_id
        }
        return jsonify(response)
    
    client_principal_id = auth_info['client_principal_id']
    client_principal_name = auth_info['client_principal_name']
    client_group_names = auth_info['client_group_names']
    access_token = auth_info['access_token']

    function_key = get_function_key()
        
    try:
        url = ORCHESTRATOR_ENDPOINT
        payload = {
            "conversation_id": conversation_id,
            # "question": question,
            "question": "Examine the image",
            "client_principal_id": client_principal_id,
            "client_principal_name": client_principal_name,
            "client_group_names": client_group_names
        }

        logging.debug(f"[webbackend] Read before reading file bytes.")

        # If a file was uploaded, store it in Azure Blob Storage and pass blob reference
        if file:
            logging.debug(f"[webbackend] file is available")
            try:
                # Read file bytes
                file_bytes = file.read()
                logging.debug(f"[webbackend] Read {len(file_bytes)} bytes from uploaded file '{file.filename}'.")
                original_name = secure_filename(file.filename) or 'uploaded_file'
                logging.debug(f"[webbackend] Secured original filename: {original_name}")
                unique_suffix = uuid.uuid4().hex
                logging.debug(f"[webbackend] Generated unique suffix: {unique_suffix}")
                blob_name = f"{conversation_id}_{unique_suffix}_{original_name}"
                logging.debug(f"[webbackend] Constructed blob name: {blob_name}")

                # Acquire credential chain (Managed Identity preferred, fallback to Azure CLI)
                client_credential = ChainedTokenCredential(
                    ManagedIdentityCredential(),
                    AzureCliCredential()
                )
                logging.debug("[webbackend] Acquired ChainedTokenCredential for blob upload.")
                blob_service_client = BlobServiceClient(
                    f"https://{STORAGE_ACCOUNT}.blob.core.windows.net",
                    client_credential
                )
                logging.debug(f"[webbackend] Initialized BlobServiceClient for account '{STORAGE_ACCOUNT}'.")

                # Ensure container exists (idempotent)
                try:
                    container_client = blob_service_client.get_container_client(UPLOAD_CONTAINER)
                    if not container_client.exists():
                        logging.info(f"[webbackend] Creating upload container '{UPLOAD_CONTAINER}'")
                        container_client.create_container()
                    else:
                        logging.debug(f"[webbackend] Upload container '{UPLOAD_CONTAINER}' already exists.")
                except Exception as ce:
                    logging.warning(f"[webbackend] Could not verify/create container '{UPLOAD_CONTAINER}': {ce}")
                    container_client = blob_service_client.get_container_client(UPLOAD_CONTAINER)
                logging.debug(f"[webbackend] Obtained container client for '{UPLOAD_CONTAINER}'.")

                blob_client = container_client.get_blob_client(blob_name)
                logging.debug(f"[webbackend] Obtained blob client for blob '{blob_name}'. Beginning upload.")
                blob_client.upload_blob(file_bytes, overwrite=True)
                logging.info(f"[webbackend] Uploaded file to blob '{blob_name}' in container '{UPLOAD_CONTAINER}' (size={len(file_bytes)} bytes)")
                payload["uploaded_file_blob"] = blob_name
                payload["uploaded_file_content_type"] = file.content_type
                logging.debug(f"[webbackend] Added blob reference and content type '{file.content_type}' to payload.")
            except Exception as fe:
                logging.exception("[webbackend] Failed uploading file to Azure Blob Storage; continuing without file reference")

        if FORWARD_ACCESS_TOKEN_TO_ORCHESTRATOR and access_token:
            logging.info("[webbackend] Forwarding access token to orchestrator.")
            payload['access_token'] = access_token

        headers = {
            'Content-Type': 'application/json',
            'x-functions-key': function_key  
        }
        response = requests.post(url, headers=headers, json=payload)
        logging.info(f"[webbackend] response: {response.text[:100]}...")
        return response.text
    except Exception as e:
        logging.error("[webbackend] exception in /chatgpt")
        logging.exception(e)
        response = {
            "answer": "Error in application backend.",
            "thoughts": "",
            "conversation_id": conversation_id
        }
        return jsonify(response)
    finally:
        end_time = time.time()  
        duration = end_time - start_time
        logging.info(f"[webbackend] Finished processing in {duration:.2f} seconds")

@app.route("/api/get-speech-token", methods=["GET"])
def getGptSpeechToken():
    try:
        token = get_managed_identity_token()
        fetch_token_url = f"https://{SPEECH_REGION}.api.cognitive.microsoft.com/sts/v1.0/issueToken"
        headers = {
            'Authorization': f'Bearer {token}',
            'Content-Type': 'application/x-www-form-urlencoded'
        }
        response = requests.post(fetch_token_url, headers=headers)
        access_token = str(response.text)
        return json.dumps({
            'token': access_token,
            'region': SPEECH_REGION,
            'speechRecognitionLanguage': SPEECH_RECOGNITION_LANGUAGE,
            'speechSynthesisLanguage': SPEECH_SYNTHESIS_LANGUAGE,
            'speechSynthesisVoiceName': SPEECH_SYNTHESIS_VOICE_NAME
        })
    except Exception as e:
        logging.exception("[webbackend] exception in /api/get-speech-token")
        return jsonify({"error": str(e)}), 500

@app.route("/api/get-storage-account", methods=["GET"])
def getStorageAccount():
    if not STORAGE_ACCOUNT:
        return jsonify({"error": "Add STORAGE_ACCOUNT to frontend app settings"}), 500
    try:
        return json.dumps({'storageaccount': STORAGE_ACCOUNT})
    except Exception as e:
        logging.exception("[webbackend] exception in /api/get-storage-account")
        return jsonify({"error": str(e)}), 500

@app.route("/api/get-blob", methods=["POST"])
def getBlob():
    blob_name = unquote(request.json["blob_name"])
    logging.info(f"Starting getBlob function for blob: {blob_name}")
    try:
        client_credential = ChainedTokenCredential(
            ManagedIdentityCredential(),
            AzureCliCredential()
        )
        blob_service_client = BlobServiceClient(
            f"https://{STORAGE_ACCOUNT}.blob.core.windows.net",
            client_credential
        )
        blob_client = blob_service_client.get_blob_client(container='documents', blob=blob_name)
        blob_data = blob_client.download_blob()
        blob_text = blob_data.readall()
        logging.info(f"Successfully fetched blob: {blob_name}")
        return Response(blob_text, content_type='application/octet-stream')
    except Exception as e:
        logging.exception("[webbackend] exception in /api/get-blob")
        logging.exception(blob_name)
        return jsonify({"error": str(e)}), 500
    
if __name__ == "__main__":
    app.run(host='0.0.0.0', port=8000)
