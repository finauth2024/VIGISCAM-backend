import { detectTactics } from './tactics';

describe('tactic detector', () => {
  it('returns [] for benign text', () => {
    expect(detectTactics('hello, how are you today')).toEqual([]);
  });

  it('detects URGENCY', () => {
    expect(detectTactics('You need to act fast right now')).toContain('URGENCY');
    expect(detectTactics('Hurry, this is urgent')).toContain('URGENCY');
  });

  it('detects SECRECY', () => {
    expect(detectTactics("Don't tell anyone about this")).toContain('SECRECY');
    expect(detectTactics('keep this confidential between us')).toContain('SECRECY');
  });

  it('detects AUTHORITY', () => {
    expect(detectTactics('I am from the IRS and you owe taxes')).toContain('AUTHORITY');
    expect(detectTactics('Officer Jones speaking from the FBI')).toContain('AUTHORITY');
  });

  it('detects ISOLATION', () => {
    expect(detectTactics("Don't trust them, they'll lie to you")).toContain('ISOLATION');
    expect(detectTactics("Stay on the line, don't hang up")).toContain('ISOLATION');
  });

  it('detects REWARD', () => {
    expect(detectTactics('Congratulations, you have won a prize')).toContain('REWARD');
    expect(detectTactics('Claim your free money grant today')).toContain('REWARD');
  });

  it('detects THREAT', () => {
    expect(detectTactics('There is a warrant for your arrest')).toContain('THREAT');
    expect(detectTactics("You face deportation if you don't pay")).toContain('THREAT');
  });

  it('detects EMOTIONAL_PRESSURE', () => {
    expect(detectTactics('my son is dying in the hospital, please help')).toContain(
      'EMOTIONAL_PRESSURE',
    );
    expect(detectTactics('I love you, you are my only hope')).toContain('EMOTIONAL_PRESSURE');
  });

  it('returns a deduped set when the same tactic fires multiple times', () => {
    const text = 'urgent! act fast right now, hurry';
    expect(detectTactics(text)).toEqual(['URGENCY']);
  });

  it('returns multiple tactics when several match', () => {
    const text = "I'm from the IRS. Act fast right now or face arrest. Don't tell anyone.";
    const result = detectTactics(text);
    expect(result).toContain('AUTHORITY');
    expect(result).toContain('URGENCY');
    expect(result).toContain('THREAT');
    expect(result).toContain('SECRECY');
  });

  it('is case-insensitive', () => {
    expect(detectTactics('YOU NEED TO ACT FAST RIGHT NOW')).toContain('URGENCY');
  });
});
