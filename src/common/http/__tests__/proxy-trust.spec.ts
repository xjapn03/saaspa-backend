import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { TRUSTED_PROXY_HOPS, applyProxyTrust } from '../proxy-trust';

@Module({})
class EmptyModule {}

describe('applyProxyTrust', () => {
  let app: NestExpressApplication;

  beforeEach(async () => {
    app = await NestFactory.create<NestExpressApplication>(EmptyModule, { logger: false });
  });

  afterEach(async () => {
    await app.close();
  });

  it('trusts exactly one hop instead of every proxy', () => {
    applyProxyTrust(app);

    const express = app.getHttpAdapter().getInstance() as { get(setting: string): unknown };

    expect(TRUSTED_PROXY_HOPS).toBe(1);
    expect(express.get('trust proxy')).toBe(1);
    // With `true` Express reads the leftmost X-Forwarded-For entry, the one the
    // client writes, and the rate limit bucket becomes spoofable (finding J-03).
    expect(express.get('trust proxy')).not.toBe(true);
  });
});
