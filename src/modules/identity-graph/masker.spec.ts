import { FraudGraphNodeType } from '@prisma/client';
import { mask } from './masker';

function node(args: {
  nodeType: FraudGraphNodeType;
  normalizedIndicator?: string | null;
  displayMask?: string | null;
  label?: string;
}) {
  return {
    nodeType: args.nodeType,
    normalizedIndicator: args.normalizedIndicator ?? null,
    displayMask: args.displayMask ?? null,
    label: args.label ?? '<label>',
  };
}

describe('identity-graph masker', () => {
  it('returns the stored displayMask when present (server-of-record wins)', () => {
    expect(
      mask(
        node({
          nodeType: 'INDICATOR',
          normalizedIndicator: 'titus@example.com',
          displayMask: 'preset-mask',
        }),
      ),
    ).toBe('preset-mask');
  });

  it('masks an email INDICATOR to first letter + ***', () => {
    expect(mask(node({ nodeType: 'INDICATOR', normalizedIndicator: 'titus@example.com' }))).toBe(
      't****@example.com',
    );
  });

  it('masks an E.164 phone INDICATOR to last 4', () => {
    expect(mask(node({ nodeType: 'INDICATOR', normalizedIndicator: '+15551234567' }))).toBe(
      '+15-***-***-4567',
    );
  });

  it('masks a long crypto wallet to head + tail', () => {
    const v = '0x71C7656EC7ab88b098defB751B7401B5f6d8976F';
    expect(mask(node({ nodeType: 'INDICATOR', normalizedIndicator: v }))).toBe('0x71C7...d8976F');
  });

  it('masks a PROFILE handle to first + last 2', () => {
    expect(mask(node({ nodeType: 'PROFILE', normalizedIndicator: '@paypalsupport' }))).toBe(
      '@p**********rt',
    );
  });

  it('short PROFILE collapses to first + ***', () => {
    expect(mask(node({ nodeType: 'PROFILE', normalizedIndicator: '@bob' }))).toBe('@b***');
  });

  it('masks an opaque FACE_SIGNAL hash to first 8 chars', () => {
    expect(
      mask(
        node({
          nodeType: 'FACE_SIGNAL',
          normalizedIndicator: 'a1b2c3d4e5f6g7h8i9j0',
        }),
      ),
    ).toBe('a1b2c3d4…');
  });

  it('masks a VOICE_SIGNAL the same way', () => {
    expect(
      mask(
        node({
          nodeType: 'VOICE_SIGNAL',
          normalizedIndicator: 'zzzzzzzzwxyz',
        }),
      ),
    ).toBe('zzzzzzzz…');
  });

  it('passes through DOMAIN INDICATOR (public-safe by construction)', () => {
    expect(
      mask(
        node({
          nodeType: 'INDICATOR',
          normalizedIndicator: 'verify-paypal-secure.com',
          label: 'verify-paypal-secure.com',
        }),
      ),
    ).toBe('verify-paypal-secure.com');
  });

  it('falls back to the label when normalizedIndicator is null (CAMPAIGN nodes)', () => {
    expect(
      mask(
        node({
          nodeType: 'CAMPAIGN',
          normalizedIndicator: null,
          label: 'Bank impersonation cluster 2026-A',
        }),
      ),
    ).toBe('Bank impersonation cluster 2026-A');
  });
});
