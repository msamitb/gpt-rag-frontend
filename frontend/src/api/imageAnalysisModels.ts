export interface ImageAnalysisResponse {
    id?: string;
    model?: string;
    created?: number;
    // Generic JSON payload returned by backend describing analysis
    result: any;
    // Optional error message
    error?: string;
}
