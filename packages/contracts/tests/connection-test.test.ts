import { describe, expect, it } from 'vitest';
import {
  isLoopbackApiHost,
  validateBaseUrl,
} from '../src/api/connectionTest';

describe('provider base URL validation', () => {
  it('allows public endpoints and loopback local providers', () => {
    for (const baseUrl of [
      'https://api.openai.com/v1',
      'http://localhost:11434/v1',
      'http://127.0.0.1:11434/v1',
      'http://[::1]:11434/v1',
      'http://[::ffff:127.0.0.1]:11434/v1',
    ]) {
      expect(validateBaseUrl(baseUrl).error).toBeUndefined();
    }
  });

  it('identifies trailing-dot FQDN forms of loopback hosts as loopback', () => {
    // Direct assertion against isLoopbackApiHost — validateBaseUrl alone
    // can't distinguish "passed because loopback" from "passed because
    // not blocked", which the previous test revision conflated.
    for (const host of ['localhost.', '127.0.0.1.', '127.0.0.5.']) {
      expect(isLoopbackApiHost(host)).toBe(true);
    }
  });

  it('refuses the bogons that are universally misconfigurations', () => {
    for (const baseUrl of [
      'http://0.0.0.0:11434/v1',
      'http://169.254.169.254/latest/meta-data',
      'http://224.0.0.1:11434/v1',
      'http://[::]/v1',
      'http://[fe80::1]:11434/v1',
      'http://[::ffff:169.254.169.254]/latest/meta-data',
    ]) {
      expect(validateBaseUrl(baseUrl)).toMatchObject({
        error: 'Internal IPs blocked',
        forbidden: true,
      });
    }
  });

  it('accepts RFC1918, CGNAT, and IPv6 ULA on the default user-config path', () => {
    // Local-First: BYOK base URLs on LAN / VPN-internal space are accepted
    // without configuration. The strict asset-URL guard uses a wider
    // predicate via `forbidLoopback: true`; the daemon-level
    // `local-first-ssrf.test.ts` pins both halves of the contract.
    for (const baseUrl of [
      'http://10.0.0.5:11434/v1',
      'http://100.64.0.1:11434/v1',
      'http://172.16.0.5:11434/v1',
      'http://192.168.1.5:11434/v1',
      'http://[fd00::1]:11434/v1',
      'http://[::ffff:192.168.1.5]:11434/v1',
    ]) {
      expect(
        validateBaseUrl(baseUrl).error,
        `expected ${baseUrl} to be accepted`,
      ).toBeUndefined();
    }
  });

  it('blocks trailing-dot FQDN bypass across every bogon range', () => {
    // The trailing-dot strip in normalizeBracketedIpv6 must apply to
    // every range the bogon predicate covers. RFC1918/CGNAT/ULA are no
    // longer blocked on the user-config path, so they are not part of
    // this assertion.
    for (const baseUrl of [
      'http://0.0.0.0.:11434/v1',
      'http://169.254.169.254./latest/meta-data',
      'http://224.0.0.1.:11434/v1',
    ]) {
      expect(validateBaseUrl(baseUrl)).toMatchObject({
        error: 'Internal IPs blocked',
        forbidden: true,
      });
    }
  });
});
