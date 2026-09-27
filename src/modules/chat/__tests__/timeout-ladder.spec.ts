import { DEFAULT_IA_BOT_TIMEOUT_MS } from '../chat.constants';

/**
 * Hallazgo J-04 (escalera de timeouts invertida): un turno del chat tiene que
 * respetar
 *
 *   timeout del backend  >  turn-deadline de saaspa-IA  >  read-timeout por intento
 *
 * Si el backend corta antes que el asistente, responde 504 mientras saaspa-IA
 * sigue trabajando: gasta tokens, puede llamar a la API interna después de una
 * respuesta que ya nadie espera y deja en su memoria un turno que la clienta
 * nunca vio. Los números del asistente viven en su configuración y en la nota
 * compartida de `docs/contracts/` de ese repo, así que se declaran aquí como
 * contrato: si alguno se mueve, se mueven los dos repos y esta prueba.
 */
const IA_TURN_DEADLINE_MS = 20000;
const IA_READ_TIMEOUT_MS = 10000;

describe('chat timeout ladder (J-04)', () => {
  it('waits longer than the deadline the assistant applies to the same turn', () => {
    expect(DEFAULT_IA_BOT_TIMEOUT_MS).toBeGreaterThan(IA_TURN_DEADLINE_MS);
  });

  it('keeps the assistant deadline above the read timeout of one attempt', () => {
    expect(IA_TURN_DEADLINE_MS).toBeGreaterThan(IA_READ_TIMEOUT_MS);
  });

  it('leaves margin so the backend never cuts a turn the assistant is finishing', () => {
    expect(DEFAULT_IA_BOT_TIMEOUT_MS - IA_TURN_DEADLINE_MS).toBeGreaterThanOrEqual(5000);
  });

  it('documents the numbers agreed with saaspa-IA', () => {
    // Si esta prueba falla porque alguien movió un número, la escalera se mueve
    // en los dos repos (y en la nota de docs/contracts/ de saaspa-IA) antes de
    // actualizar los valores de aquí.
    expect({
      backend: DEFAULT_IA_BOT_TIMEOUT_MS,
      iaTurnDeadline: IA_TURN_DEADLINE_MS,
      iaReadTimeout: IA_READ_TIMEOUT_MS,
    }).toEqual({ backend: 25000, iaTurnDeadline: 20000, iaReadTimeout: 10000 });
  });
});
