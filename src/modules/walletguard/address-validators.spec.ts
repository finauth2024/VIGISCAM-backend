import { isAddressValid } from './address-validators';

describe('address validators', () => {
  describe('ETH-family (ETH/BSC/MATIC/ARBITRUM/OPTIMISM)', () => {
    const valid = '0x71C7656EC7ab88b098defB751B7401B5f6d8976F';
    it('accepts a correctly-formatted 0x address on every EVM network', () => {
      for (const net of ['ETH', 'BSC', 'MATIC', 'ARBITRUM', 'OPTIMISM'] as const) {
        expect(isAddressValid(net, valid)).toBe(true);
      }
    });
    it('rejects too-short', () => {
      expect(isAddressValid('ETH', '0xdead')).toBe(false);
    });
    it('rejects non-hex characters', () => {
      expect(isAddressValid('ETH', '0xZZZZ656EC7ab88b098defB751B7401B5f6d8976F')).toBe(false);
    });
    it('rejects missing 0x', () => {
      expect(isAddressValid('ETH', '71C7656EC7ab88b098defB751B7401B5f6d8976F')).toBe(false);
    });
  });

  describe('BTC', () => {
    it('accepts legacy 1...', () => {
      expect(isAddressValid('BTC', '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2')).toBe(true);
    });
    it('accepts P2SH 3...', () => {
      expect(isAddressValid('BTC', '3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy')).toBe(true);
    });
    it('accepts bech32 bc1...', () => {
      expect(isAddressValid('BTC', 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4')).toBe(true);
    });
    it('rejects random garbage', () => {
      expect(isAddressValid('BTC', 'not-a-bitcoin-address')).toBe(false);
    });
  });

  describe('TRX', () => {
    it('accepts a valid T-prefixed address', () => {
      expect(isAddressValid('TRX', 'TLsV52sRDL79HXGGm9yzwKibb6BeruhUzy')).toBe(true);
    });
    it('rejects wrong length', () => {
      expect(isAddressValid('TRX', 'TLsV52sRDL79HXGGm9yz')).toBe(false);
    });
  });

  describe('SOL', () => {
    it('accepts a 32-44 char base58 address', () => {
      expect(isAddressValid('SOL', '4Nd1mYxNvK3rWZ4mPzVqWp9YxYz7tH8X6vM2u3qR9pHs')).toBe(true);
    });
    it('rejects too-short', () => {
      expect(isAddressValid('SOL', 'tooshort')).toBe(false);
    });
  });

  describe('OTHER', () => {
    it('accepts a reasonably-sized opaque token', () => {
      expect(isAddressValid('OTHER', 'addr_xyz_12345_token')).toBe(true);
    });
    it('rejects empty / whitespace-only', () => {
      expect(isAddressValid('OTHER', '   ')).toBe(false);
      expect(isAddressValid('OTHER', '')).toBe(false);
    });
  });

  it('trims surrounding whitespace before validating', () => {
    const valid = '  0x71C7656EC7ab88b098defB751B7401B5f6d8976F  ';
    expect(isAddressValid('ETH', valid)).toBe(true);
  });
});
