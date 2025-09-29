import { useState } from "react";
import { Stack, TextField } from "@fluentui/react";
import { getTokenOrRefresh } from './token_util';
import { Send28Filled, BookOpenMicrophone28Filled, SlideMicrophone32Filled, AttachFilled, Search20Filled } from "@fluentui/react-icons";
import { ResultReason, SpeechConfig, AudioConfig, SpeechRecognizer } from 'microsoft-cognitiveservices-speech-sdk';
import { getLanguageText } from '../../utils/languageUtils';

import styles from "./QuestionInput.module.css";
interface Props {
    onSend: (question: string, file?: File | null) => void;
    disabled: boolean;
    placeholder?: string;
    clearOnSend?: boolean;
}

export const QuestionInput = ({ onSend, disabled, placeholder, clearOnSend }: Props) => {
    const [question, setQuestion] = useState<string>("");
    const [file, setFile] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState<string | null>(null);

    // const onQuestionChange = (_ev: React.FormEvent<HTMLInputElement | HTMLTextAreaElement>, newValue?: string) => {
    //     setQuestion(newValue ?? "");
    // };

    const sendQuestion = () => {
        if (disabled || !question.trim()) {
            return;
        }

        onSend(question, file || undefined);

        if (clearOnSend) {
            setQuestion("");
            setFile(null);
            setImagePreview(null);
        }
    };

    const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = e.target.files?.[0] || null;
        if (selectedFile?.type.startsWith("image/")) {
            setFile(selectedFile);
            setImagePreview(URL.createObjectURL(selectedFile));
        } else {
            setFile(null);
            setImagePreview(null);
        }
    };

    const sttFromMic = async () => {
        const tokenObj = await getTokenOrRefresh();
        const speechConfig = SpeechConfig.fromAuthorizationToken(tokenObj.authToken, tokenObj.region);
        speechConfig.speechRecognitionLanguage = tokenObj.speechRecognitionLanguage;
        
        const audioConfig = AudioConfig.fromDefaultMicrophoneInput();
        const recognizer = new SpeechRecognizer(speechConfig, audioConfig);

        const reiniciar_text = getLanguageText('micPrompt');

        setQuestion(reiniciar_text);

        recognizer.recognizeOnceAsync(result => {
            let displayText;
            if (result.reason === ResultReason.RecognizedSpeech) {
                displayText = result.text;
            } else {
                displayText = 'ERROR: Voice recognition was canceled or the voice cannot be recognized. Make sure your microphone is working properly.';
            }
            setQuestion(displayText);
        });
    };

    const onEnterPress = (ev: React.KeyboardEvent<Element>) => {
        if (ev.key === "Enter" && !ev.shiftKey) {
            ev.preventDefault();
            sendQuestion();
        }
    };

    const onQuestionChange = (_ev: React.FormEvent<HTMLInputElement | HTMLTextAreaElement>, newValue?: string) => {
        if (!newValue) {
            setQuestion("");
        } else if (newValue.length <= 1000) {
            setQuestion(newValue);
        }
    };

    const cancelImage = () => {
        setFile(null);
        setImagePreview(null);
    };

    const sendQuestionDisabled = disabled || !question.trim();

    return (
        <div className={styles.inputContainer}>
            {imagePreview && (
                <div className={styles.imagePreviewWrapper}>
                    <img src={imagePreview} alt="Preview" className={styles.imagePreview} />
                    <button className={styles.cancelImageButton} onClick={cancelImage}>✕</button>
                </div>
            )}

            <TextField
                className={styles.textArea}
                placeholder={placeholder}
                multiline
                resizable={false}
                borderless
                value={question}
                onChange={onQuestionChange}
                onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        sendQuestion();
                    }
                }}
            />

            <div className={styles.buttonBar}>
                <label className={styles.iconButton}>
                    <input type="file" accept="image/*" hidden onChange={onFileChange} disabled={disabled} />
                    <AttachFilled primaryFill="#7376E1" />
                </label>
                {/* <div
                    className={`${styles.sendButton} ${sendQuestionDisabled ? styles.disabled : ""}`}
                    onClick={!sendQuestionDisabled ? sendQuestion : undefined}
                > */}
                <div className={styles.questionInputButtonsContainer}>
                    <div
                        className={`${styles.questionInputSendButton} ${sendQuestionDisabled ? styles.questionInputSendButtonDisabled : ""}`}
                        aria-label="Ask Questions"
                        onClick={sendQuestion}
                    >
                    <Send28Filled primaryFill="rgba(115, 118, 225, 1)" />
                    </div>
                </div>
                {/* </div> */}
            </div>
        </div>
    );
};
