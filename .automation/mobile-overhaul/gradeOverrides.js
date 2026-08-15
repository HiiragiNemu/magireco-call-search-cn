// Explicit grade classifications for characters whose school name is not sufficient.
window.EXPLICIT_GRADE_ATTRIBUTES = new Map([
    ['瀬奈みこと', new Set(['中2', '中学生'])],
    ['浅古小糸', new Set(['中学生'])],
    ['行方晶', new Set(['中3', '中学生'])]
]);

window.GRADE_OVERRIDE_NOTES = Object.freeze({
    '瀬奈みこと': {
        note: '大东学院八年级；按日本学制归入初二／初中生。',
        source: 'https://wiki.puella-magi.net/Sena_Mikoto'
    },
    '浅古小糸': {
        note: '资料只确认是中学生，不擅自推断具体年级。',
        source: 'https://bgm.tv/character/198529'
    },
    '行方晶': {
        note: '15岁、九年级；归入初三／初中生。',
        source: 'https://wiki.puella-magi.net/Akira_Namekata'
    }
});
