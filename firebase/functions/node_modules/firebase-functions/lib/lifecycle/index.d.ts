export interface TaskAction {
    function: string;
    body?: Record<string, unknown>;
}
export interface CallAction {
    function: string;
    params?: Record<string, unknown>;
}
export type HttpAction = ({
    function: string;
} | {
    url: string;
}) & {
    method?: "GET" | "POST" | "PUT" | "DELETE";
    headers?: Record<string, string>;
    body?: unknown;
};
export type LifecycleAction = {
    task: TaskAction;
    call?: never;
    http?: never;
} | {
    call: CallAction;
    task?: never;
    http?: never;
} | {
    http: HttpAction;
    task?: never;
    call?: never;
};
/**
 * Registers an action to be executed automatically post-deployment when resources in this codebase
 * are deployed for the first time.
 *
 * @param action The lifecycle action to execute.
 */
export declare function afterFirstDeploy(action: LifecycleAction): void;
/**
 * Registers an action to be executed automatically post-deployment when resources in this codebase
 * are updated.
 *
 * @param action The lifecycle action to execute.
 */
export declare function afterRedeploy(action: LifecycleAction): void;
