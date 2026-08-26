/**
 * A TypeScript literal type for IAM roles to provide compile-time validation.
 */
export type Role = `roles/${string}.${string}` | `projects/${string}/roles/${string}` | `organizations/${string}/roles/${string}`;
/**
 * Declares that this codebase requires the specified IAM role to operate.
 * When deployed, the Firebase CLI will automatically provision a managed service account
 * with this role and attach it to all functions in this codebase.
 * @param role The IAM role required (e.g. "roles/bigquery.dataEditor")
 */
export declare function requiresRole(role: Role): void;
