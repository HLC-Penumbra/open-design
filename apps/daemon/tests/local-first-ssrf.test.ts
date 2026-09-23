// Regression + contract: Local-First SSRF policy.
//
// Contract:
//   1. User-configured BYOK provider base URLs on private/LAN space (RFC1918,
//      CGNAT, IPv6 ULA, and hostnames that DNS-resolve into private space)
//      MUST be reachable with no operator allowlist — that's the whole point
//      of making OpenDesign local-first.
//   2. The two "never legitimately user-pointed" bogons — `169.254/16` (cloud
//      metadata service) and `fe80::/10` (IPv6 link-local) — stay refused on
//      the user-config path, because they are universal misconfigurations,
//      not local-model hosts. `0.0.0.0` and `::` (unspecified) stay refused
//      too.
//   3. The attacker-controllable asset-download URL guard
//      (`assertExternalAssetUrl`) keeps rejecting loopback, RFC1918, CGNAT,
//      ULA, link-local, metadata, and IPv4-mapped equivalents regardless of
//      where they come from — that is the second-order SSRF boundary and is
//      not weakened by the local-first change.
//
// These tests pin the new contract in one file. They replace the
// `OD_ALLOWED_INTERNAL_HOSTS` opt-in tests that previously lived in
// `tests/origin-validation.test.ts` and `tests/connection-test.test.ts`
// (issue #3225) and were deleted when the allowlist env var went away.

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  assertExternalAssetUrl,
  validateBaseUrlResolved,
  type DnsLookupFn,
} from '../src/connectionTest.js';

afterEach(() => {
  vi.unstubAllEnvs();
});

const LAN_BASE_URLS = [
  'http://127.0.0.1:11434/v1',
  'http://localhost:11434/v1',
  'http://[::1]:11434/v1',
  'http://192.168.1.5:11434/v1',
  'http://10.0.0.5:11434/v1',
  'http://172.20.0.10:11434/v1',
  'http://100.64.0.5:11434/v1',
  'http://[fd00::1]:11434/v1',
  'http://[::ffff:192.168.1.5]:11434/v1',
];

const STILL_BLOCKED_USER_BASE_URLS = [
  'http://0.0.0.0:11434/v1',
  'http://169.254.169.254/latest/meta-data',
  'http://[::]/v1',
  'http://[fe80::1]:11434/v1',
];

const PRIVATE_LOOKUP: DnsLookupFn = async () => [{ address: '192.168.1.5', family: 4 }];

describe('validateBaseUrlResolved: local-first user-configured endpoints', () => {
  it('permits RFC1918 / CGNAT / IPv6 ULA base URLs with no env var set', async () => {
    for (const baseUrl of LAN_BASE_URLS) {
      const result = await validateBaseUrlResolved(baseUrl);
      expect(result.error, `expected ${baseUrl} to be accepted`).toBeUndefined();
      expect(result.parsed, `expected ${baseUrl} to parse`).toBeDefined();
    }
  });

  it('permits a hostname that DNS-resolves into RFC1918 with no env var set', async () => {
    const result = await validateBaseUrlResolved('http://api.home.lab:11434/v1', PRIVATE_LOOKUP);
    expect(result.error).toBeUndefined();
    expect(result.parsed?.hostname).toBe('api.home.lab');
    expect(result.resolvedAddresses?.map((entry) => entry.address)).toEqual(['192.168.1.5']);
  });

  it('still refuses 169.254/16, fe80::/10, 0.0.0.0, and :: on the user-config path', async () => {
    for (const baseUrl of STILL_BLOCKED_USER_BASE_URLS) {
      const result = await validateBaseUrlResolved(baseUrl);
      expect(result, `expected ${baseUrl} to be refused`).toMatchObject({
        forbidden: true,
      });
      expect(result.error, `expected ${baseUrl} to carry a reason`).toBeDefined();
    }
  });
});

describe('assertExternalAssetUrl: attacker-controllable guard stays strict', () => {
  it('rejects a loopback asset URL regardless of any operator allowlist', async () => {
    const result = await assertExternalAssetUrl('http://127.0.0.1/img.png');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/loopback|blocked/i);
  });

  it('rejects an RFC1918 asset URL even though user-configured base URLs accept that range', async () => {
    const result = await assertExternalAssetUrl('http://192.168.1.5/img.png');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/blocked/i);
  });

  it('rejects a hostname that resolves into RFC1918 on the asset path', async () => {
    const result = await assertExternalAssetUrl(
      'http://api.home.lab/img.png',
      PRIVATE_LOOKUP,
    );
    expect(result.ok).toBe(false);
  });

  it('rejects the cloud metadata service on the asset path even with a literal IP', async () => {
    const result = await assertExternalAssetUrl('http://169.254.169.254/latest/meta-data');
    expect(result.ok).toBe(false);
  });

  it('rejects an IPv6 ULA asset URL', async () => {
    const result = await assertExternalAssetUrl('http://[fd00::1]/img.png');
    expect(result.ok).toBe(false);
  });
});
