import React, { useCallback, useState } from "react";
import { ImageAnalysisInput } from "../../components/ImageAnalysisInput/ImageAnalysisInput";
import styles from "./ImageAnalysisPage.module.css";
import { ToastHost, ToastMessage } from "../../components/Toast/ToastHost";
import { AnalysisResultPanel } from "../../components/AnalysisResultPanel/AnalysisResultPanel";
import { AskResponseGpt } from "../../api";

const ImageAnalysisPage: React.FC = () => {
    const [loading, setLoading] = useState(false); // retained for potential future inline spinner, overlay removed
    const [toasts, setToasts] = useState<ToastMessage[]>([]);
    const [analysisResult, setAnalysisResult] = useState<AskResponseGpt | null>(null);

    const pushToast = useCallback((msg: Omit<ToastMessage, "id">) => {
        setToasts(prev => [...prev, { ...msg, id: crypto.randomUUID() }]);
    }, []);

    const handleError = useCallback((error: string) => {
        pushToast({ intent: "error", title: "Error", description: error });
    }, [pushToast]);

    return (
        <main className={styles.pageWrapper} aria-labelledby="image-analysis-heading">
            <header className={styles.hero}>
                {/* <div className={styles.heroIconWrap} aria-hidden="true">
                    <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="3" width="7" height="7" rx="1" />
                        <rect x="14" y="3" width="7" height="7" rx="1" />
                        <rect x="14" y="14" width="7" height="7" rx="1" />
                        <rect x="3" y="14" width="7" height="7" rx="1" />
                        <circle cx="7" cy="7" r="1.5" fill="currentColor" />
                        <circle cx="17" cy="7" r="1.5" fill="currentColor" />
                        <circle cx="17" cy="17" r="1.5" fill="currentColor" />
                        <circle cx="7" cy="17" r="1.5" fill="currentColor" />
                    </svg>
                </div> */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <h1 id="image-analysis-heading" className={styles.heroTitle}>Image Analyzer</h1>
                    {/* <p className={styles.heroTagline}>Upload. Analyze. Inspect structured & raw results instantly.</p> */}
                </div>
            </header>
            <div className={styles.leftPane} aria-label="Upload image section">
                <ImageAnalysisInput
                    onLoadingChange={setLoading}
                    onError={handleError}
                    onResult={res => {
                        setAnalysisResult(res);
                        if (!res.error) {
                            pushToast({ intent: "info", title: "Analysis complete", description: "Image analyzed successfully." });
                        }
                    }}
                />
            </div>
            <div className={styles.rightPane} aria-label="Analysis result section">
                <AnalysisResultPanel result={analysisResult} />
            </div>
            {/* Global loading overlay removed per request */}
            <ToastHost messages={toasts} onDismiss={id => setToasts(prev => prev.filter(t => t.id !== id))} />
        </main>
    );
};

export default ImageAnalysisPage;
