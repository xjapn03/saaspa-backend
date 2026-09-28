import { PROBLEM_EXTENSIONS, pickProblemExtensions } from '../problem-extensions';

describe('pickProblemExtensions', () => {
  it('copies the documented cost cap members', () => {
    const picked = pickProblemExtensions({
      detail: 'Tope de coste superado',
      scope: 'tenant',
      measure: 'tokens',
      measured: 12000,
      limit: 10000,
      window: 'PT1H',
    });

    expect(picked).toEqual({
      scope: 'tenant',
      measure: 'tokens',
      measured: 12000,
      limit: 10000,
      window: 'PT1H',
    });
  });

  it('keeps only the members that are actually present', () => {
    expect(pickProblemExtensions({ scope: 'conversation' })).toEqual({ scope: 'conversation' });
  });

  it('ignores anything that is not a documented member', () => {
    expect(
      pickProblemExtensions({ detail: 'x', title: 'y', status: 429, clientIp: '10.0.0.1' }),
    ).toEqual({});
  });

  it('tolerates a missing or non-object source', () => {
    expect(pickProblemExtensions(undefined)).toEqual({});
    expect(pickProblemExtensions(null)).toEqual({});
    expect(pickProblemExtensions('not-an-object')).toEqual({});
  });

  it('exposes exactly the documented keys', () => {
    expect([...PROBLEM_EXTENSIONS]).toEqual(['scope', 'measure', 'measured', 'limit', 'window']);
  });
});
