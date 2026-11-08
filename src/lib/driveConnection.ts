export interface DriveConnection {
  ownerId: string;
  googleId: string;
  expiresAt: number;
}

// Visibility only: Google still authorizes every file operation with its own token.
export function ownsDriveConnection(
  connection: DriveConnection | null,
  ownerId: string | undefined,
  googleId: string | undefined,
  now = Date.now(),
): boolean {
  return Boolean(ownerId && googleId && connection &&
    connection.ownerId === ownerId && connection.googleId === googleId &&
    connection.expiresAt > now);
}