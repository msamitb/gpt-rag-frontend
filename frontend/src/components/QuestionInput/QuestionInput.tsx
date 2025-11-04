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
    const [question, setQuestion] = useState<string>("");          // kept but not user-editable
    const [file, setFile] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState<string | null>(null);

    // Text entry disabled: remove onChange editing path & Enter handling

    const sendQuestion = () => {
        // Allow send if an image is attached even with empty text
        if (disabled || (!file && !question.trim())) {
            return;
        }
        const effectiveQuestion = question.trim() || " ";
        onSend(effectiveQuestion, file || undefined);

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
            // Optionally auto-assign a placeholder question internally
            if (!question.trim()) {
                setQuestion("");
            }
        } else {
            setFile(null);
            setImagePreview(null);
            setQuestion("");
        }
    };

    const cancelImage = () => {
        setFile(null);
        setImagePreview(null);
        setQuestion(""); // reset internal question
    };

    // Disable send unless image present (or someone programmatically set question)
    const sendQuestionDisabled = disabled || (!file && !question.trim());

    return (
        <div className={styles.inputContainer}>
            {imagePreview && (
                <div className={styles.imagePreviewWrapper}>
                    <img src={imagePreview} alt="Preview" className={styles.imagePreview} />
                    <button className={styles.cancelImageButton} onClick={cancelImage}>✕</button>
                </div>
            )}

            {/* Read-only (or could be removed entirely). Keeping for placeholder context. */}
            {/* <TextField
                className={styles.textArea}
                placeholder={placeholder || "Attach an image"}
                multiline
                resizable={false}
                borderless
                value={""}                  // always empty visually
                readOnly                    // prevents typing
                disabled={true}             // greys out field; remove if you prefer read-only look
            /> */}

            <div className={styles.buttonBar}>
                <label className={styles.iconButton}>
                    <input
                        type="file"
                        accept="image/*"
                        hidden
                        onChange={onFileChange}
                        disabled={disabled}
                    />
                    <AttachFilled primaryFill="#7376E1" />
                </label>

                <div className={styles.questionInputButtonsContainer}>
                    <div
                        className={`${styles.questionInputSendButton} ${sendQuestionDisabled ? styles.questionInputSendButtonDisabled : ""}`}
                        aria-label="Send Image"
                        onClick={!sendQuestionDisabled ? sendQuestion : undefined}
                        title={sendQuestionDisabled ? "Attach an image to enable send" : "Send"}
                    >
                        <Send28Filled primaryFill="rgba(115, 118, 225, 1)" />
                    </div>
                </div>
            </div>
        </div>
    );
};
