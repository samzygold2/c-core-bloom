import { describe, expect, test } from 'bun:test';
import { ownsDriveConnection } from '../../src/lib/driveConnection';

const connection = { ownerId: 'registered-admin', googleId: 'personal-google', expiresAt: 2000 };
describe('Personal Google Drive visibility', () => {
  test('registered connected account sees Drive', () => {
    expect(ownsDriveConnection(connection, 'registered-admin', 'personal-google', 1000)).toBe(true);
  });
  test('another admin or student cannot inherit a connection', () => {
    expect(ownsDriveConnection(connection, 'another-admin', 'personal-google', 1000)).toBe(false);
    expect(ownsDriveConnection(connection, 'student', 'personal-google', 1000)).toBe(false);
  });
  test('unconnected accounts cannot see Drive', () => {
    expect(ownsDriveConnection(null, 'student', 'personal-google', 1000)).toBe(false);
  });
  test('signed-out accounts cannot see Drive', () => {
    expect(ownsDriveConnection(connection, undefined, 'personal-google', 1000)).toBe(false);
  });
  test('switching Google accounts hides the old connection', () => {
    expect(ownsDriveConnection(connection, 'registered-admin', 'different-google', 1000)).toBe(false);
  });
  test('expired connections cannot see Drive', () => {
    expect(ownsDriveConnection(connection, 'registered-admin', 'personal-google', 2000)).toBe(false);
  });
});