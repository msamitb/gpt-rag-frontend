import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { DefaultButton, PrimaryButton, ProgressIndicator, Icon } from "@fluentui/react";
import styles from "./ImageAnalysisInput.module.css";
import { chatApiGpt, Approaches, AskResponseGpt } from "../../api";
import { ChatTurn } from "../../api/models";

interface Props {
    onResult?: (result: AskResponseGpt) => void;
    onLoadingChange?: (loading: boolean) => void;
    onError?: (message: string) => void;
}

export const ImageAnalysisInput: React.FC<Props> = ({ onResult, onLoadingChange, onError }) => {
    const [file, setFile] = useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null);
    const [imageLoading, setImageLoading] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<AskResponseGpt | null>(null);
    const [error, setError] = useState<string | null>(null);
    const inputRef = useRef<HTMLInputElement | null>(null);
    const [copied, setCopied] = useState(false);
    const navigate = useNavigate();

    const revokePreview = () => {
        if (previewUrl) {
            URL.revokeObjectURL(previewUrl);
        }
    };

    const reset = () => {
        revokePreview();
        setFile(null);
        setPreviewUrl(null);
        setResult(null);
        setError(null);
        setCopied(false);
        if (inputRef.current) {
            inputRef.current.value = ""; // allow re-selecting same file
        }
    };

    const onFilesSelected = (files: FileList | null) => {
        if (!files || files.length === 0) return;
        const f = files[0];
        if (file && f.name === file.name && f.size === file.size) {
            const msg = "You have already selected this image. Choose a different file to replace it.";
            setError(msg);
            onError?.(msg);
            return;
        }
        // Whitelisted extensions
        const allowedExt = ["jpg","jpeg","jpe","jif","jfi","jfif","png","bmp","heic","heif"]; // lower-case without dot
        const nameLower = f.name.toLowerCase();
        const ext = nameLower.includes('.') ? nameLower.split('.').pop() || '' : '';
        if (!allowedExt.includes(ext)) {
            const msg = `Uploaded file error.
                        Supported formats:
                        .jpg .jpeg .jpe .jif .jfi .jfif .png .bmp .heic .heif`;
            setError(msg);
            onError?.(msg);
            return;
        }
        // 2MB size limit
        const maxBytes = 2 * 1024 * 1024;
        if (f.size > maxBytes) {
            setError("Image exceeds 2MB size limit.");
            return;
        }
        setError(null);
        setResult(null);
        // Revoke previous preview before creating new one
        revokePreview();
        setFile(f);
        setDimensions(null);
        setImageLoading(true);
        const url = URL.createObjectURL(f);
        setPreviewUrl(url);
        if (inputRef.current) {
            // ensure change events fire even if same file selected again later
            inputRef.current.value = "";
        }
    };

    const onDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        onFilesSelected(e.dataTransfer.files);
    }, []);

    const onDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const onDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
    };

    const triggerFilePicker = () => {
        if (inputRef.current) {
            // Clear value so selecting same file triggers onChange
            inputRef.current.value = "";
        }
        inputRef.current?.click();
    };

    // Cleanup preview URL on unmount
    useEffect(() => {
        return () => {
            revokePreview();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const analyze = async () => {
        if (!file) return;
        setLoading(true);
        onLoadingChange?.(true);
        setError(null);
        setCopied(false);
        try {
            // Minimal history; could be expanded if multi-turn needed later
            const history: ChatTurn[] = [{ user: "system", bot: "Ready" }];
            const response = await chatApiGpt({
                history,
                approach: Approaches.ReadRetrieveRead,
                conversation_id: result?.conversation_id || "", // reuse if exists
                query: "Analyze this image",
                file
            });
            setResult(response);
            if (onResult) onResult(response);
            if (response.error) {
                setError(response.error);
                onError?.(response.error);
            }
        } catch (e: any) {
            const msg = e.message || "Unexpected error during analysis";
            setError(msg);
            onError?.(msg);
        } finally {
            setLoading(false);
            onLoadingChange?.(false);
        }
    };

    // Result copying now handled in parent result panel.

    return (
        <div className={styles.root}>
            <div
                className={`${styles.dropZone} ${isDragging ? styles.dragActive : ""} ${loading ? styles.disabled : ""}`}
                onDragOver={loading ? undefined : onDragOver}
                onDragLeave={loading ? undefined : onDragLeave}
                onDrop={loading ? undefined : onDrop}
                onClick={loading ? undefined : triggerFilePicker}
                aria-label="Image upload drop zone"
                aria-disabled={loading}
            >
                {loading && (
                    <div className={styles.localLoadingOverlay} role="alert" aria-live="polite">
                        <div className={styles.spinner} />
                        <div className={styles.loadingLabel}>Running Analysis...</div>
                    </div>
                )}
                {previewUrl ? (
                    <div className={styles.previewWrapper}>
                        <div className={styles.thumbnailWrapper}>
                            {imageLoading && (
                                <div className={styles.thumbnailSkeleton} aria-label="Loading image preview" />
                            )}
                            <img
                                src={previewUrl}
                                alt={file?.name || "preview"}
                                className={styles.previewImage}
                                style={{ visibility: imageLoading ? "hidden" : "visible" }}
                                onLoad={e => {
                                    const img = e.currentTarget;
                                    setDimensions({ width: img.naturalWidth, height: img.naturalHeight });
                                    setImageLoading(false);
                                }}
                                onError={() => {
                                    setError("Failed to load image preview.");
                                    setImageLoading(false);
                                }}
                            />
                        </div>
                        <div className={styles.metaBlock}>
                            <div className={styles.metaRow}><strong>Name:</strong> {file?.name}</div>
                            <div className={styles.metaRow}><strong>Size:</strong> {file ? `${(file.size / 1024).toFixed(1)} KB` : "-"}</div>
                            <div className={styles.metaRow}><strong>Type:</strong> {file?.type || "-"}</div>
                            {/* <div className={styles.metaRow}><strong>Dimensions:</strong> {dimensions ? `${dimensions.width}×${dimensions.height}px` : imageLoading ? "Loading..." : "-"}</div> */}
                        </div>
                        <div className={styles.actions}>
                                                                                    <PrimaryButton
                                                                                        onClick={e => { e.stopPropagation(); analyze(); }}
                                                                                        disabled={!file || loading || imageLoading}
                                                                                    >
                                                                <span style={{ display: 'inline-flex', alignItems: 'center', marginRight: 6 }}>
                                                                    <svg fill="currentColor" width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg">
                                                                        <path d="M2 5.5A2.5 2.5 0 0 1 4.5 3h1a.5.5 0 0 1 0 1h-1C3.67 4 3 4.67 3 5.5v1a.5.5 0 0 1-1 0v-1Zm12-2c0-.28.22-.5.5-.5h1A2.5 2.5 0 0 1 18 5.5v1a.5.5 0 0 1-1 0v-1c0-.83-.67-1.5-1.5-1.5h-1a.5.5 0 0 1-.5-.5ZM2.5 13c.28 0 .5.22.5.5v1c0 .83.67 1.5 1.5 1.5h1a.5.5 0 0 1 0 1h-1A2.5 2.5 0 0 1 2 14.5v-1c0-.28.22-.5.5-.5Zm15 0c.28 0 .5.22.5.5v1a2.5 2.5 0 0 1-2.5 2.5h-1a.5.5 0 0 1 0-1h1c.83 0 1.5-.67 1.5-1.5v-1c0-.28.22-.5.5-.5Zm-12-7c.28 0 .5.22.5.5v7a.5.5 0 0 1-1 0v-7c0-.28.22-.5.5-.5Zm3.5.5a.5.5 0 0 0-1 0v7a.5.5 0 0 0 1 0v-7Zm2.5-.5c.28 0 .5.22.5.5v7a.5.5 0 0 1-1 0v-7c0-.28.22-.5.5-.5Zm3.5.5a.5.5 0 0 0-1 0v7a.5.5 0 0 0 1 0v-7Z" />
                                                                    </svg>
                                                                </span>
                                                                Run analysis
                                                        </PrimaryButton>
                                                                                    <DefaultButton
                                                                                        onClick={e => { e.stopPropagation(); triggerFilePicker(); }}
                                                                                        disabled={loading}
                                                                                    >
                                <Icon iconName="Edit" style={{ marginRight: 6 }} /> Change Image
                            </DefaultButton>
                                                                                    <DefaultButton
                                                                                        onClick={e => { e.stopPropagation(); reset(); navigate("/"); }}
                                                                                        disabled={loading}
                                                                                    >
                                <Icon iconName="Delete" style={{ marginRight: 6 }} /> Remove Image
                            </DefaultButton>
                        </div>
                    </div>
                ) : (
                    <>
                        <p><strong>Drag & Drop</strong> an image here, or click to select.</p>
                        <p className={styles.placeholderText}>Supported: .jpg, .jpeg, .jpe, .jif, .jfi, .jfif, .png, .bmp, .heic, .heif</p>
                    </>
                )}
                <input
                    ref={inputRef}
                    type="file"
                    // Explicit list (no webp) so webp files are hidden in picker
                    accept=".jpg,.jpeg,.jpe,.jif,.jfi,.jfif,.png,.bmp,.heic,.heif"
                    style={{ display: "none" }}
                    onChange={e => onFilesSelected(e.target.files)}
                />
            </div>
            {loading && <ProgressIndicator label="Analyzing image" />}
            {/* Error messaging now handled via toast notifications */}
            {/* Analysis result removed from input component; parent handles display */}
        </div>
    );
};
