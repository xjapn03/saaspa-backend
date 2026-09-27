import {
  deriveSessionKey,
  issueAnonymousSessionId,
  readIssuedSessionId,
  signAnonymousSessionId,
} from '../chat-session';

const SECRET = 'test-secret';
const key = deriveSessionKey(SECRET);

describe('anonymous chat session id', () => {
  it('issues 128 bit ids that do not repeat', () => {
    const first = issueAnonymousSessionId();
    const second = issueAnonymousSessionId();

    expect(first).toMatch(/^[0-9a-f]{32}$/);
    expect(second).toMatch(/^[0-9a-f]{32}$/);
    expect(first).not.toBe(second);
  });

  it('reads back a value it signed', () => {
    const id = issueAnonymousSessionId();

    expect(readIssuedSessionId(signAnonymousSessionId(id, key), key)).toBe(id);
  });

  it.each([
    ['an id without a signature', 'a'.repeat(32)],
    ['a short client chosen value', 'short'],
    ['an invented signature', `${'a'.repeat(32)}.${'b'.repeat(64)}`],
    ['a truncated signature', `${'a'.repeat(32)}.${'b'.repeat(63)}`],
    ['extra segments', `${'a'.repeat(32)}.${'b'.repeat(64)}.extra`],
    ['an empty value', ''],
    ['a non string value', undefined],
  ])('rejects %s', (_label, value) => {
    expect(readIssuedSessionId(value, key)).toBeNull();
  });

  it('rejects a value signed with another key', () => {
    const id = issueAnonymousSessionId();
    const otherKey = deriveSessionKey('another-secret');

    expect(readIssuedSessionId(signAnonymousSessionId(id, otherKey), key)).toBeNull();
  });

  it('fails closed when the secret is missing', () => {
    expect(() => deriveSessionKey('')).toThrow('JWT_SECRET');
  });
});
