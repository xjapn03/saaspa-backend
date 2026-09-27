import { resolveClientIp } from '../client-ip';

describe('resolveClientIp', () => {
  it('returns the address Express resolved for the request', () => {
    expect(resolveClientIp({ ip: '203.0.113.7' })).toBe('203.0.113.7');
  });

  it('keeps an IPv6 address as it is, without normalising it', () => {
    // The value has to stay byte-identical to the throttler bucket: the same
    // string is what req.ip returns for that bucket.
    expect(resolveClientIp({ ip: '2001:db8::1' })).toBe('2001:db8::1');
    expect(resolveClientIp({ ip: '::ffff:127.0.0.1' })).toBe('::ffff:127.0.0.1');
  });

  it('returns undefined when Express did not resolve an address', () => {
    expect(resolveClientIp({})).toBeUndefined();
    expect(resolveClientIp({ ip: undefined })).toBeUndefined();
    expect(resolveClientIp(undefined)).toBeUndefined();
    expect(resolveClientIp(null)).toBeUndefined();
  });

  it('treats a blank address as absent', () => {
    expect(resolveClientIp({ ip: '' })).toBeUndefined();
    expect(resolveClientIp({ ip: '   ' })).toBeUndefined();
  });
});
