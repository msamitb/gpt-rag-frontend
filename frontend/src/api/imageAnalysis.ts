import { ImageAnalysisResponse } from "./imageAnalysisModels";

// Placeholder API call – expects backend endpoint /api/image/analyze accepting multipart/form-data with field "file"
export async function analyzeImage(file: File): Promise<ImageAnalysisResponse> {
    const formData = new FormData();
    formData.append("file", file);

    const response = await fetch("/api/image/analyze", {
        method: "POST",
        body: formData
    });

    // If non-JSON response or error, attempt to build a standardized object
    let json: ImageAnalysisResponse;
    try {
        json = await response.json();
    } catch (e) {
        json = { result: null, error: "Invalid JSON response from server" };
    }

    if (!response.ok) {
        return { ...json, error: json.error || `Request failed: ${response.status}` };
    }

    // Normalize shape – ensure result exists
    if (json.result === undefined) {
        json.result = json;
    }
    return json;
}
