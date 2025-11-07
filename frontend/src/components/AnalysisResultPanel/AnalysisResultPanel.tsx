import React, { useState } from "react";
import styles from "./AnalysisResultPanel.module.css";
import { AskResponseGpt } from "../../api";

interface Props {
  result: AskResponseGpt | null;
}

export const AnalysisResultPanel: React.FC<Props> = ({ result }) => {
  const [activeTab, setActiveTab] = useState<'formatted' | 'raw'>('formatted');
  const [copied, setCopied] = useState(false);
  const [hoveringCopy, setHoveringCopy] = useState(false);
  const [hoveringDownload, setHoveringDownload] = useState(false);

  const copy = () => {
    if (!result) return;
    navigator.clipboard.writeText(JSON.stringify(result, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  const download = () => {
    if (!result) return;
    const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'analysis_result.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const renderStructured = () => {
    if (!result) return null;
    // Expect shape: { result: { contents: [ { fields: { key: { type, valueString } } } ] } }
    const contents = (result as any)?.result?.contents;
    if (!Array.isArray(contents) || contents.length === 0) {
      return <div className={styles.structuredList}><div className={styles.kvItem}>No fields returned.</div></div>;
    }
    // Preserve ordering: iterate each contents item in sequence, then each field as defined.
    const rendered: React.ReactNode[] = [];
    contents.forEach((c: any, idx: number) => {
      if (!c || !c.fields || typeof c.fields !== 'object') return;
      Object.entries(c.fields).forEach(([key, fieldObj]: [string, any]) => {
        const valueString = fieldObj?.valueString;
        const display = valueString !== undefined ? valueString : (() => {
          try { return JSON.stringify(fieldObj, null, 2); } catch { return String(fieldObj); }
        })();
        rendered.push(
          <div key={`${idx}-${key}`} className={styles.kvItem}>
            <div className={styles.kvKey}><span className={styles.bullet} aria-hidden="true" />{key}</div>
            <div className={styles.kvValue}>{display}</div>
          </div>
        );
      });
    });
    if (rendered.length === 0) {
      return <div className={styles.structuredList}><div className={styles.kvItem}>No fields returned.</div></div>;
    }
    return <div className={styles.structuredList}>{rendered}</div>;
  };

  return (
    <div className={styles.panelCard} aria-label="Analysis output">
      {/* <div className={styles.headerRow}>
        <h2 className={styles.title}>Result</h2>
      </div> */}
      <div className={styles.tabs} role="tablist" aria-label="Result view mode">
        <button
          role="tab"
          aria-selected={activeTab === 'formatted'}
          className={`${styles.tabButton} ${activeTab === 'formatted' ? styles.tabButtonActive : ''}`}
          onClick={() => setActiveTab('formatted')}
        >Fields</button>
        <button
          role="tab"
          aria-selected={activeTab === 'raw'}
          className={`${styles.tabButton} ${activeTab === 'raw' ? styles.tabButtonActive : ''}`}
          onClick={() => setActiveTab('raw')}
        >Result</button>
      </div>
      {!result && <div className={styles.emptyState}>No analysis yet. Upload an image and click Analyze.</div>}
      {result && activeTab === 'formatted' && (
        <div className={styles.contentArea} aria-label="Formatted key value view">
          {renderStructured()}
        </div>
      )}
      {result && activeTab === 'raw' && (
        <div className={styles.contentArea} aria-label="Raw JSON view">
          <div className={styles.rawHeader}>
            <div className={styles.iconBar}>
              <button
                className={styles.iconBtn}
                onClick={copy}
                disabled={!result}
                aria-label="Copy JSON result"
                onMouseEnter={() => setHoveringCopy(true)}
                onMouseLeave={() => setHoveringCopy(false)}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4c0-1.1.9-2 2-2h9a2 2 0 0 1 2 2v1"></path>
                </svg>
                <span className={styles.tooltip}>{copied ? 'Copied!' : 'Copy JSON'}</span>
              </button>
              <button
                className={styles.iconBtn}
                onClick={download}
                disabled={!result}
                aria-label="Download JSON result"
                onMouseEnter={() => setHoveringDownload(true)}
                onMouseLeave={() => setHoveringDownload(false)}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                <span className={styles.tooltip}>Download JSON</span>
              </button>
            </div>
          </div>
          <pre className={styles.jsonScroll}>{JSON.stringify(result, null, 2)}</pre>
        </div>
      )}
    </div>
  );
};
