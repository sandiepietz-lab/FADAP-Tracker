export type GoogleCloudApi = `${string}.googleapis.com`;
/**
 * Declare that this project requires a specific Google Cloud API to be enabled.
 * @param api The API name, e.g. "secretmanager.googleapis.com"
 * @param reason Optional reason why the API is needed.
 */
export declare function requiresAPI(api: GoogleCloudApi, reason?: string): void;
