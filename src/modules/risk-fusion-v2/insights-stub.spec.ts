import {
  stubAssessJourney,
  stubAssessVictimState,
  stubPredictNextMove,
  STUB_JOURNEY_VERSION,
  STUB_VICTIM_STATE_VERSION,
  STUB_PREDICTED_MOVE_VERSION,
} from './insights-stub';

describe('Phase 6E insight stubs', () => {
  describe('stubAssessJourney', () => {
    it('detects PAYMENT_REQUEST from payment keywords', () => {
      const r = stubAssessJourney({ transcript: 'Please wire the money right away, send a gift card.' });
      expect(r.stage).toBe('PAYMENT_REQUEST');
      expect(r.modelVersion).toBe(STUB_JOURNEY_VERSION);
      expect(r.confidence).toBeGreaterThan(35);
    });

    it('honours an explicit forceStage hint', () => {
      const r = stubAssessJourney({ forceStage: 'URGENCY_INJECTION' });
      expect(r.stage).toBe('URGENCY_INJECTION');
      expect(r.confidence).toBe(80);
    });

    it('defaults to INITIAL_CONTACT with low confidence on benign text', () => {
      const r = stubAssessJourney({ transcript: 'Just calling to check in, how are you?' });
      expect(r.stage).toBe('INITIAL_CONTACT');
      expect(r.confidence).toBeLessThan(40);
    });
  });

  describe('stubAssessVictimState', () => {
    it('detects ALARMED from fear keywords', () => {
      const r = stubAssessVictimState({ transcript: "I'm scared they'll arrest me, I'm panicked." });
      expect(r.state).toBe('ALARMED');
      expect(r.modelVersion).toBe(STUB_VICTIM_STATE_VERSION);
    });

    it('detects COMPROMISED from compliance keywords', () => {
      const r = stubAssessVictimState({ transcript: "Okay, I'll do it. Alright then." });
      expect(r.state).toBe('COMPROMISED');
    });

    it('defaults to CALM on benign text', () => {
      const r = stubAssessVictimState({ transcript: 'Sure, talk later.' });
      expect(r.state).toBe('CALM');
    });
  });

  describe('stubPredictNextMove', () => {
    it('moves PAYMENT_REQUEST → REQUEST_GIFT_CARD', () => {
      const r = stubPredictNextMove('PAYMENT_REQUEST');
      expect(r.action).toBe('REQUEST_GIFT_CARD');
      expect(r.modelVersion).toBe(STUB_PREDICTED_MOVE_VERSION);
    });

    it('moves URGENCY_INJECTION → REQUEST_PAYMENT', () => {
      expect(stubPredictNextMove('URGENCY_INJECTION').action).toBe('REQUEST_PAYMENT');
    });

    it('predicts DROP_OFF for terminal stages', () => {
      expect(stubPredictNextMove('COMPLETED').action).toBe('DROP_OFF');
      expect(stubPredictNextMove('INTERVENED').action).toBe('DROP_OFF');
    });
  });
});
