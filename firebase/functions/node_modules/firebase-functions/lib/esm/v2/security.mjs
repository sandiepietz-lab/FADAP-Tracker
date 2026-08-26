import { registerRole } from "../security/roles.mjs";

//#region src/v2/security.ts
/**
* Declares that this codebase requires the specified IAM role to operate.
* When deployed, the Firebase CLI will automatically provision a managed service account
* with this role and attach it to all functions in this codebase.
* @param role The IAM role required (e.g. "roles/bigquery.dataEditor")
*/
function requiresRole(role) {
	const roleRegex = /^(roles\/[a-zA-Z0-9_.-]+|projects\/[a-zA-Z0-9_-]+\/roles\/[a-zA-Z0-9_.-]+|organizations\/[a-zA-Z0-9_-]+\/roles\/[a-zA-Z0-9_.-]+)$/;
	if (!roleRegex.test(role)) {
		throw new Error(`Invalid role: "${role}". Role must be a valid GCP IAM role format (e.g., "roles/viewer", "projects/<project-id>/roles/<custom-role>", or "organizations/<org-id>/roles/<custom-role>").`);
	}
	registerRole(role);
}

//#endregion
export { requiresRole };