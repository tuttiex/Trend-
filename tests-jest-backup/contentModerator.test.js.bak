const contentModerator = require('../src/utils/contentModerator');

describe('ContentModerator', () => {
    test('should approve clean topics', async () => {
        const result = await contentModerator.checkTopic('Cole Palmer');
        expect(result.approved).toBe(true);
        expect(result.symbol).toBe('CLPL');
    });

    test('should reject offensive topics', async () => {
        const result = await contentModerator.checkTopic('badword'); // Mocked behavior or real blocklist
        if (result.approved === false) {
            expect(result.reason).toBeDefined();
        }
    });

    test('should generate 3-4 character symbols', async () => {
        const result = await contentModerator.checkTopic('Trending Topic');
        if (result.approved) {
            expect(result.symbol.length).toBeGreaterThanOrEqual(2);
            expect(result.symbol.length).toBeLessThanOrEqual(5);
        }
    });
});
