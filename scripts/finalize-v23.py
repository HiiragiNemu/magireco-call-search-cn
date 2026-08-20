#!/usr/bin/env python3
from __future__ import annotations

import argparse
import collections
import csv
import datetime as dt
import hashlib
import json
import re
import subprocess
import sys
import unicodedata
from pathlib import Path
from typing import Any

KANA_RE = re.compile(r"[\u3040-\u30ff\u31f0-\u31ffー]")
NO_RE = re.compile(r"^No\.(\d+)\b", re.I)
NUMBER_SPLIT_RE = re.compile(r"(\d+)")
RELEASE = "v23-authoritative-cn-20260820"
AUTHORITY_ORDER = [
    "magireco-cn-patch/magica/js/libs",
    "existing human/audited translations",
    "MagiReader",
    "magireco-wiki-data",
    "assistant/manual fallback",
]

EVENT_EXACT = {
    "Bittersweet AI Memory": "Bittersweet AI Memory",
    "Crimson Resolve〜深紅の決断〜": "Crimson Resolve～深红的决断～",
    "Crimson Resolve〜深紅の決断〜 アオ編": "Crimson Resolve～深红的决断～ 青篇",
    "Crimson Resolve〜深紅の決断〜 全体編": "Crimson Resolve～深红的决断～ 全体篇",
    "Crimson Resolve〜深紅の決断〜 樹里編": "Crimson Resolve～深红的决断～ 树里篇",
    "Crimson Resolve〜深紅の決断〜 結菜・樹里編": "Crimson Resolve～深红的决断～ 结菜·树里篇",
    "Crimson Resolve〜深紅の決断〜 結菜編": "Crimson Resolve～深红的决断～ 结菜篇",
    "Homecoming ～佐倉杏子の３日間～": "Homecoming～佐仓杏子的3天～",
    "Last Bird's Hope": "Last Bird's Hope",
    "Little Bird's Star": "Little Bird's Star",
    "Magia Clash!!": "Magia Clash!!",
    "Mixed Summer！～幻のベストショット～": "Mixed Summer！～梦幻的最佳镜头～",
    "Rumors in Disguise": "Rumors in Disguise",
    "うたたかの夏夜": "转瞬即逝的夏夜",
    "そしてこれから。～うわさのウワサの噂～": "然后从此开始。～传闻之传闻的传闻～",
    "ほわほわ少女頑張る!": "呆萌少女要加油！",
    "みかづき荘のMerry Chrismas": "三日月别墅的Merry Christmas",
    "みたまの特訓 いろは・やちよ編": "御魂的特训 彩羽·八千代篇",
    "みたまの特訓 アリナ・ひなの編": "御魂的特训 阿莉娜·雏乃篇",
    "みたまの特訓 天音姉妹・鶴乃編": "御魂的特训 天音姐妹·鹤乃篇",
    "みたまの特訓 杏子・フェリシア編": "御魂的特训 杏子·菲莉希亚篇",
    "アシュリー・テイラーのジャパニーズホラーはどこデスカ!?": "阿什莉·泰勒的日式恐怖在哪里!?",
    "アラカルトバレンタイン": "缤纷情人节",
    "アラカルトバレンタイン 2nd": "缤纷情人节 2nd",
    "アリナが街にやってくる": "阿莉娜进城来",
    "アンノウン・ストーリー ～真夏の魔法と明日の記憶～": "Unknown Story～盛夏的魔法和明天的记忆～",
    "ウワサアクアリウムへようこそ": "欢迎来到谣言水族馆",
    "ガールズ・イン・ザ・フッド": "Girls in the Hood",
    "キモチ戦特別編 アリナ・イブ": "心魔战特别篇 阿莉娜·夏娃",
    "トリック☆トラブル☆学園祭": "诡计☆骚乱☆学园祭",
    "トリック☆トラブル☆学園祭 BADEND": "诡计☆骚乱☆学园祭 坏结局",
    "トリック☆トラブル☆学園祭 トラブル編": "诡计☆骚乱☆学园祭 骚乱篇",
    "トリック☆トラブル☆学園祭 未解決編": "诡计☆骚乱☆学园祭 未解决篇",
    "トリック☆トラブル☆学園祭 解決編": "诡计☆骚乱☆学园祭 解决篇",
    "トリック☆トラブル☆学園祭 通常編": "诡计☆骚乱☆学园祭 通常篇",
    "ドリームハロウィンフェスタ ～アリナ先輩！いい子になるの！～": "Dream Halloween Festa～阿莉娜前辈！做个好孩子！～",
    "バイバイ、また明日": "拜拜，明天见",
    "バイバイ、また明日 せいか編": "拜拜，明天见 清佳篇",
    "バイバイ、また明日 みと編": "拜拜，明天见 未都篇",
    "バイバイ、また明日 れいら編": "拜拜，明天见 丽良篇",
    "バイバイ、また明日 ３人編": "拜拜，明天见 三人篇",
    "仮面生徒会の逆襲 ～魔法少女たると☆マギカ（聖乙女学園編）～": "假面学生会的逆袭～魔法少女贞德（圣少女学院篇）～",
    "伝説の終わり、光の果て": "传说的终章，光辉的尽头",
    "全神祭で遊ぼう！ ～私たちの小さな休み時間〜": "玩转全神祭！～我们短暂的休息时间～",
    "復刻 CROSS CONNECTION": "复刻 CROSS CONNECTION",
    "復刻 あの日の一番を超えて": "复刻 超越昔日之最",
    "復刻 そしてアザレアの花咲く": "复刻 而后杜鹃花开",
    "復刻 そしてアザレアの花咲く あやめ編": "复刻 而后杜鹃花开 菖蒲篇",
    "復刻 そしてアザレアの花咲く このは編": "复刻 而后杜鹃花开 木叶篇",
    "復刻 そしてアザレアの花咲く 三人編": "复刻 而后杜鹃花开 三人篇",
    "復刻 そしてアザレアの花咲く 三人編EPILOGE": "复刻 而后杜鹃花开 三人篇 尾声",
    "復刻 そしてアザレアの花咲く 葉月編": "复刻 而后杜鹃花开 叶月篇",
    "復刻 みかづき荘のSummer Vacation": "复刻 三日月庄的Summer Vacation",
    "復刻 みかづき荘のSummer Vacation 1日目": "复刻 三日月庄的Summer Vacation 第1天",
    "復刻 みかづき荘のSummer Vacation 2日目": "复刻 三日月庄的Summer Vacation 第2天",
    "復刻 みかづき荘のSummer Vacation 3日目": "复刻 三日月庄的Summer Vacation 第3天",
    "復刻 みかづき荘のSummer Vacation 4日目": "复刻 三日月庄的Summer Vacation 第4天",
    "復刻 みかづき荘のSummer Vacation 5日目": "复刻 三日月庄的Summer Vacation 第5天",
    "復刻 みかづき荘のSummer Vacation 6日目": "复刻 三日月庄的Summer Vacation 第6天",
    "復刻 みかづき荘のSummer Vacation 7日目": "复刻 三日月庄的Summer Vacation 第7天",
    "復刻 サマトレ！～火に消えた夏の宝～": "复刻 夏日寻宝！～火中消失的夏之宝物～",
    "復刻 君と綴る日記": "复刻 与你谱写的日记",
    "復刻 時を越えて鳴らす鐘": "复刻 超越时空的钟声",
    "復刻 祈りと弔いのハロウィン城 ～生者は惑い死者は黙する～": "复刻 祈祷和悼念的万圣夜之城～生者迷茫，死者沉默～",
    "復刻 耳を撫でて彼岸の声": "复刻 轻抚耳畔的彼岸之声",
    "復刻 駆け出しメイド十七夜 闊達自在": "复刻 初出茅庐女仆十七夜 阔达自在",
    "散花愁章": "散花愁章",
    "明けまして初まつり！～恋ごころと真ごころと～": "新年初次节庆！～恋心与真心～",
    "時女拾遺物語 ～初日の出を呼びませう！～": "时女拾遗物语～唤来元旦日出吧！～",
    "沙優希ステップアップ仕る！ですぅ～": "沙优希更上一层楼！的说～",
    "深碧の巫 すなお編": "深碧之巫 沙绪篇",
    "深碧の巫 ちはる・静香編": "深碧之巫 千春·静香篇",
    "深碧の巫 ちはる編": "深碧之巫 千春篇",
    "神フェス": "神Fes",
    "神浜チーズパニック！": "神滨奶酪恐慌！",
    "聖夜に刻む１ページ～君と、ここから～": "圣夜铭刻的一页～与你，从此～",
    "遊狩ミユリの現在修行中！": "游狩美由利的现在修行中！",
    "闇色ハロウィンは恋の色!? ～繋げて・恋の東西最前線！～": "暗夜色万圣节染上恋爱的颜色!?～连起来吧·东西方恋爱最前线！～",
    "はじまりは夢を重ねて": "始于反复的梦",
    "はじまりは夢を重ねて あやめ編": "始于反复的梦 菖蒲篇",
    "はじまりは夢を重ねて このは編": "始于反复的梦 木叶篇",
    "はじまりは夢を重ねて 全体編": "始于反复的梦 全体篇",
    "はじまりは夢を重ねて 葉月編": "始于反复的梦 叶月篇",
}

SPECIAL_MAP = {
    "Kamihama Kawaii Collection Ep.1(英語版)": "Kamihama Kawaii Collection Ep.1（英语版）",
    "お願い！水名のかみさま！": "拜托了！水名的神明！",
    "ことし1番のあったかい日": "今年最温暖的一天",
    "それぞれの福袋ドリーム": "各自的福袋之梦",
    "ちょこっと伝える「ありがとう」": "稍稍传达一句“谢谢”",
    "みかづき荘の平和な1日": "三日月庄和平的一天",
    "みたまの撮影会 前編 2018 エイプリルフール": "御魂的摄影会 前篇 2018 愚人节",
    "みたまの撮影会 後編 2018 エイプリルフール": "御魂的摄影会 后篇 2018 愚人节",
    "イチカレーと10辛級のクライシス": "一份咖喱与10级辣度危机",
    "ウォーミングバレンタイン": "暖心情人节",
    "サンタクロースには涙を見せない": "不让圣诞老人看见眼泪",
    "ドキドキ!パレンタインデイズ": "心跳！情人节时光",
    "バレンタインエール": "情人节应援",
    "ホリデーにゃぷらいず！": "假日喵惊喜！",
    "ミラーズインタビュー": "镜层访谈",
    "メリークリスマスはみんなの手に": "圣诞快乐掌握在大家手中",
    "レジストする者たちに祝福を": "祝福抵抗之人",
    "主役はいつだって私！": "主角永远是我！",
    "双子サンタのイリュージョン": "双子圣诞老人的幻术",
    "大凶は雪解けの予感": "大凶预示着冰雪消融",
    "女神様と不思議なレコード": "女神与不可思议的记录",
    "女神様と見守るレコード": "与女神共同守望的记录",
    "想いを包んでバレンタイン！": "包裹心意的情人节！",
    "愉快なハロウィンへご招待！": "邀你参加愉快的万圣节！",
    "新たな年の風を感じて": "感受新年之风",
    "新春ラッキードリーム": "新春幸运梦",
    "新春！もちもちお餅大会！": "新春！软糯年糕大会！",
    "未来への装関関係": "通往未来的装环关系",
    "極彩色のキセキ": "极彩色的奇迹",
    "楽しい手作りひな祭り": "快乐的手作女儿节",
    "海は時をつないで": "大海联结时光",
    "環になって神浜": "环绕成圆的神滨",
    "神浜しあわせ宅配便": "神滨幸福宅急便",
    "神浜チョコレートガールズ": "神滨巧克力女孩",
    "笑顔の？ハロウィンライブショー！": "笑容满面？万圣节现场秀！",
    "笑顔をお届け!トナカイサンタ!": "送上笑容！驯鹿圣诞老人！",
    "筆染め掲げる今年の抱負！": "挥毫写下今年的抱负！",
    "素直になれない14日": "无法坦率的14天",
    "行かないでバレンタイン": "别走，情人节",
}

COSTUME_MAP = {
    "まどか先輩 鹿目アロハ": "小圆前辈 鹿目夏威夷衫",
    "アシュリー・テイラー 冬服": "阿什莉·泰勒 冬装",
    "アシュリー・テイラー 水着(2022)": "阿什莉·泰勒 泳装（2022）",
    "アリナ・グレイ アトリエ着": "阿莉娜·格雷 工作室服",
    "アリナ・グレイ 入院着": "阿莉娜·格雷 住院服",
    "アリナ・グレイ 水着(2019)": "阿莉娜·格雷 泳装（2019）",
    "七海やちよ 神浜市立大付属学校の制服": "七海八千代 神滨市立大学附属学校校服",
    "佐倉杏子 ハロウィンシアターの衣装": "佐仓杏子 万圣节剧场服装",
    "八雲みたま 大東学院の制服": "八云御魂 大东学院校服",
    "加賀見まさら アウトドアウェア": "加贺见真良 户外装",
    "和泉十七夜 メイド服": "和泉十七夜 女仆装",
    "土岐すなお カメ": "土岐沙绪 乌龟",
    "広江ちはる トリ": "广江千春 飞鸟",
    "時女静香 トラ": "时女静香 老虎",
    "梓みふゆ 水名女学園の制服": "梓美冬 水名女子学校校服",
    "氷室ラビ エプロン": "冰室拉比 围裙",
    "深月フェリシア ハロウィンシアターの衣装": "深月菲莉希亚 万圣节剧场服装",
    "牧野郁美 メイド服": "牧野郁美 女仆装",
    "環いろは メイド服": "环彩羽 女仆装",
    "粟根こころ アウトドアウェア": "粟根心 户外装",
    "胡桃まなか コック服": "胡桃爱香 厨师服",
}

STICKER_MAP = {
    "#016 紙袋の魔法少女": "#016 纸袋魔法少女",
    "#018 佐倉杏子(神浜のすがた)": "#018 佐仓杏子（神滨形态）",
    "#020 お菓子の魔女": "#020 点心魔女",
    "#063 アリナ・グレイ": "#063 阿莉娜·格雷",
    "#092 いろは・やちよ": "#092 彩羽·八千代",
    "#095 梨花・れん": "#095 梨花·怜",
    "#120 水着レナ・かえで": "#120 泳装玲奈·枫",
    "#123 やちよ・みふゆ": "#123 八千代·美冬",
    "#124 シスターももこ": "#124 修女桃子",
    "#125 ヴァンパイア十七夜": "#125 吸血鬼十七夜",
    "#126 鶴乃・フェリシア": "#126 鹤乃·菲莉希亚",
    "#127 灯花・ねむ": "#127 灯花·音梦",
    "#130 リヴィア・メディロス": "#130 莉薇娅·梅黛洛斯",
    "#144 アシュリー・テイラー": "#144 阿什莉·泰勒",
    "#145 アイドルレナ": "#145 偶像玲奈",
    "#147 巫女いろは・うい": "#147 巫女彩羽·忧",
    "#151 波乗りさやか": "#151 冲浪沙耶香",
    "#152 人魚ももこ・みたま": "#152 人鱼桃子·御魂",
    "#153 いろは・まどか": "#153 圆·彩羽",
    "#154 ハロウィンかりん・アリナ": "#154 万圣节花凛·阿莉娜",
    "#155 X’mas那由他・みかげ": "#155 圣诞那由他·御影",
    "#160 このは・葉月": "#160 木叶·叶月",
    "#167 ホーリーマミ アニメver.": "#167 圣麻美 动画ver.",
    "#171 初日の出静香": "#171 元旦日出静香",
    "#172 ドッペル杏子": "#172 Doppel杏子",
    "#176 七海やちよアニメver.": "#176 七海八千代 动画ver.",
    "#180 おとぎ話みふゆ": "#180 童话美冬",
    "#181 おとぎ話やちよ": "#181 童话八千代",
    "#189 キモチ ラビ": "#189 心魔 拉比",
    "#192 環いろは アニメver.": "#192 环彩羽 动画ver.",
    "#193 七海やちよ アニメver.(武器あり)": "#193 七海八千代 动画ver.（有武器）",
    "#194 水波レナ アニメver.": "#194 水波玲奈 动画ver.",
    "#195 ウワサの鶴乃 アニメver.": "#195 传闻鹤乃 动画ver.",
    "#207 まさら・こころ 花嫁ver.": "#207 真良·心 新娘ver.",
    "#212 七海やちよ ヒストリアver.": "#212 七海八千代 历史ver.",
    "#217 結菜・樹里 ヴァンパイアver.": "#217 结菜·树里 吸血鬼ver.",
    "#224 れいら・せいか": "#224 丽良·清佳",
    "#225 まどか先輩・いろはちゃん": "#225 小圆前辈·小彩羽",
    "#228 いろは・黒江": "#228 彩羽·黑江",
}

HISTORIA_MAP = {
    "アレクサンドリアの蜃気楼編": "亚历山德里亚的蜃楼篇",
    "チベットのラクシャーシー編": "藏地的罗刹女篇",
    "パクス・ロマーナの恋人編": "罗马治世的恋人篇",
    "ヴィークのワルキューレ編": "维京的女武神篇",
}

CHARACTER_VARIANT_FIX = {
    "レナちゃん(アイドルver)": "小玲奈（偶像ver.）",
    "七海やちよ(ヒストリアver)": "七海八千代（历史ver.）",
    "佐倉杏子(ドッペルver)": "佐仓杏子（Doppel ver.）",
    "十咎ももこ(シスターver)": "十咎桃子（修女ver.）",
    "和泉十七夜(ヴァンパイアver)": "和泉十七夜（吸血鬼ver.）",
    "時女静香(初日の出ver)": "时女静香（元旦日出ver.）",
    "氷室ラビ(キモチver)": "冰室拉比（心魔ver.）",
    "美樹さやか(波乗りver)": "美树沙耶香（冲浪ver.）",
}

MEMORIA_FALLBACK = {12: "沙地魔女的手下", 36: "解心之枕", 40: "这就是恋爱的芳香", 58: "眼镜女孩约会", 60: "Splash party!", 92: "时尚全开！", 96: "休息日午睡也随心所欲", 157: "感伤的旋律", 211: "传承的遗志", 242: "咱×4", 256: "开拓吧，丘比骑士", 296: "武器是加速装置", 410: "时女的底力"}
SUFFIX_EXACT = {"1話 お姉さまとの現在地": "第1话 与姐姐大人的现状", "1話 楽しい夕べに": "第1话 在愉快的夜晚", "1話 絵から物語る": "第1话 由画诉说", "1話 2020 ひな祭り": "第1话 2020 女儿节", "EXチャレンジクエスト": "EX挑战任务", "チャレンジクエスト": "挑战任务", "百禍チャレンジクエスト": "百祸挑战任务"}
SUFFIX_REPLACEMENTS = [("2019ココイチコラボ記念", "2019 CoCo壱联动纪念"), ("リリース300日記念", "上线300天纪念"), ("ゴールデンウィーク", "黄金周"), ("エイプリルフール", "愚人节"), ("インターミッション", "幕间"), ("百禍チャレンジクエスト", "百祸挑战任务"), ("EXチャレンジクエスト", "EX挑战任务"), ("チャレンジクエスト", "挑战任务"), ("お姉さまとの現在地", "与姐姐大人的现状"), ("楽しい夕べに", "在愉快的夜晚"), ("絵から物語る", "由画诉说"), ("お正月", "新年"), ("ひな祭り", "女儿节"), ("イースター", "复活节"), ("バレンタイン", "情人节"), ("ハロウィン", "万圣节"), ("クリスマス", "圣诞"), ("アニメ", "动画"), ("ヒストリア", "历史"), ("プロローグ", "序章"), ("エピローグ", "尾声"), ("エンディング", "结局"), ("オープニング", "开场"), ("ヴァンパイア", "吸血鬼"), ("ドッペル", "Doppel"), ("キモチ", "心魔"), ("シスター", "修女"), ("サイドストーリー", "支线故事"), ("おとぎ話", "童话"), ("波乗り", "冲浪"), ("水着", "泳装"), ("花嫁", "新娘"), ("人魚", "人鱼"), ("アイドル", "偶像"), ("ホーリー", "圣"), ("メイド", "女仆"), ("アトリエ", "工作室"), ("アウトドアウェア", "户外装"), ("エプロン", "围裙"), ("コック服", "厨师服"), ("トラブル", "骚乱"), ("未解決", "未解决"), ("解決", "解决"), ("トラ", "老虎"), ("トリ", "飞鸟"), ("カメ", "乌龟"), ("お菓子", "点心"), ("紙袋", "纸袋"), ("すがた", "形态"), ("武器あり", "有武器")]
FIXED_NAME_REPLACEMENTS = [("チームみかづき荘", "三日月庄小队"), ("プロミストブラッド", "PROMISED BLOOD"), ("ネオマギウス", "Neo-Magius"), ("フォークロア", "民俗传承"), ("ユニオン", "联盟"), ("いろは・さな", "彩羽·莎奈"), ("天音姉妹・鶴乃", "天音姐妹·鹤乃"), ("結菜・樹里", "结菜·树里"), ("アリナ・ひなの", "阿莉娜·雏乃"), ("杏子・フェリシア", "杏子·菲莉希亚"), ("いろは・やちよ", "彩羽·八千代"), ("アリナ・イブ", "阿莉娜·夏娃"), ("みかげ", "御影")]


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def now_iso() -> str:
    return dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat()


def has_kana(value: str) -> bool:
    return bool(KANA_RE.search(value or ""))


def normalize_key(value: str) -> str:
    return unicodedata.normalize("NFKC", str(value or "")).replace("　", "").replace(" ", "").replace("（", "(").replace("）", ")").lower()


def natural_key(value: str) -> tuple[Any, ...]:
    normalized = unicodedata.normalize("NFKC", str(value or "")).casefold()
    return tuple(int(token) if token.isdigit() else token for token in NUMBER_SPLIT_RE.split(normalized))


def sha256_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def source_note(category: str, source: str, piece_map: dict[int, str]) -> str:
    if category == "メモリア":
        match = NO_RE.match(source)
        if match and 1000 + int(match.group(1)) in piece_map:
            return "official-libs/pieceList.json"
        return "existing/wiki/manual fallback"
    if category == "魔法少女": return "official-libs/charaList + MagiReader character catalog"
    if category == "イベント": return "official-libs event tables + MagiReader event catalog + manual fallback"
    if category == "ピュエラ・ヒストリア": return "MagiReader event catalog"
    if category in {"衣装", "シール図鑑"}: return "official character names + structured terminology"
    if category == "スペシャル": return "existing corpus + manual fallback"
    if category == "scene0": return "structured terminology"
    return "existing human/audited translation"


def build_character_map(localization: dict[str, Any]) -> tuple[dict[str, str], list[tuple[str, str]]]:
    mapping: dict[str, str] = {}
    replacements = list(FIXED_NAME_REPLACEMENTS)
    for key in ("characters", "charactersNormalized"):
        data = localization.get(key, {})
        if not isinstance(data, dict): continue
        for source, item in data.items():
            if not isinstance(item, dict): continue
            target = item.get("zh")
            if not isinstance(target, str) or not target.strip(): continue
            mapping[normalize_key(source)] = target.strip()
            if len(source) >= 2 and has_kana(source): replacements.append((source, target.strip()))
    for source, target in {"Ashley Taylor": "Ashley Taylor", "かずみ(新)": "和美（新版）", "かずみ(旧)": "和美（旧版）", "加賀美まさら": "加贺见真良", "御崎海香(新)": "御崎海香（新版）", "御崎海香(旧)": "御崎海香（旧版）", "牧カオル(新)": "牧薰（新版）", "牧カオル(旧)": "牧薰（旧版）", "未命名记录": "未命名记录"}.items():
        mapping[normalize_key(source)] = target
    deduped: dict[str, str] = {}
    for source, target in replacements: deduped.setdefault(source, target)
    return mapping, sorted(deduped.items(), key=lambda item: len(item[0]), reverse=True)


def translate_event(source: str, current: str) -> str:
    if source in EVENT_EXACT: return EVENT_EXACT[source]
    match = re.fullmatch(r"WHEREABOUTS OF THE FEATHER～羽根の行方～ チャレンジクエスト(\d+)", source)
    if match: return f"Whereabouts of the Feather～羽翼的去向～ 挑战任务{match.group(1)}"
    if source.startswith("みたまの特訓 "):
        suffix = source[len("みたまの特訓 "):]
        translated = {"かえで編": "枫篇", "ななか編": "七夏篇", "ほむら眼鏡ver編": "眼镜焰篇", "みかげ編": "御影篇", "みたま編": "御魂篇", "ウワサの鶴乃編": "传闻鹤乃篇", "フェリシア編": "菲莉希亚篇", "明日香編": "明日香篇", "月出里編": "月出里篇", "美雨編": "美雨篇", "衣美里編": "衣美里篇", "静香編": "静香篇"}.get(suffix)
        if translated: return "御魂的特训 " + translated
    return current


def translate_scene(source: str, current: str) -> str:
    if source.startswith("サイドストーリー"): return source.replace("サイドストーリー", "支线故事", 1)
    match = re.fullmatch(r"(Film\.\d+)\s+MTDAY\.\?\?-(\d+)", source)
    if match: return f"{match.group(1)} 主时间线第??天-{match.group(2)}"
    return current


def translate_group(group: dict[str, Any], piece_map: dict[int, str], character_map: dict[str, str]) -> str:
    category = str(group.get("category", "")); source = str(group.get("source_base", "")); current = str(group.get("current_translation") or source)
    if category == "メモリア":
        match = NO_RE.match(source)
        if match:
            number = int(match.group(1)); title = piece_map.get(1000 + number) or MEMORIA_FALLBACK.get(number)
            if title: return f"No.{number} {title}"
    if category == "魔法少女": return CHARACTER_VARIANT_FIX.get(source) or character_map.get(normalize_key(source), current)
    if category == "イベント": return translate_event(source, current)
    if category == "スペシャル": return SPECIAL_MAP.get(source, current)
    if category == "衣装": return COSTUME_MAP.get(source, current)
    if category == "シール図鑑": return STICKER_MAP.get(source, current)
    if category == "scene0": return translate_scene(source, current)
    if category == "ピュエラ・ヒストリア": return HISTORIA_MAP.get(source, current)
    return current


def translate_suffix(source_suffix: str, name_replacements: list[tuple[str, str]]) -> str:
    value = str(source_suffix or "").strip()
    if not value: return ""
    if value in SUFFIX_EXACT: return SUFFIX_EXACT[value]
    for source, target in name_replacements: value = value.replace(source, target)
    for source, target in sorted(SUFFIX_REPLACEMENTS, key=lambda item: len(item[0]), reverse=True): value = value.replace(source, target)
    value = re.sub(r"\bMTDAY\.\?\?-(\d+)\b", lambda m: f"主时间线第??天-{m.group(1)}", value)
    value = re.sub(r"\bDAY\.(\d+)\b", lambda m: f"第{m.group(1)}天", value)
    value = re.sub(r"(?<!第)(\d+)話", lambda m: f"第{m.group(1)}话", value)
    value = re.sub(r"(?<!第)(\d+)日目", lambda m: f"第{m.group(1)}天", value)
    value = value.replace("編", "篇").replace("話", "话").replace("百禍", "百祸")
    for source, target in {"(紫)": "（紫色）", "(桃)": "（粉色）", "(黄)": "（黄色）", "(赤)": "（红色）", "(青)": "（蓝色）", "（紫）": "（紫色）", "（桃）": "（粉色）", "（黄）": "（黄色）", "（赤）": "（红色）", "（青）": "（蓝色）"}.items(): value = value.replace(source, target)
    return value.strip()


def join_translation(base: str, suffix: str, child: dict[str, Any]) -> str:
    if not suffix: return base
    joiner = str(child.get("localized_joiner") or child.get("source_joiner") or " ")
    if joiner == "" and base and suffix and base[-1].isalnum() and suffix[0].isalnum(): joiner = " "
    return f"{base}{joiner}{suffix}".strip()


def patch_index(index_path: Path) -> None:
    text = index_path.read_text(encoding="utf-8")
    text = re.sub(r"\s*<div class=\"navtext-container\">\s*<div class=\"navtext\">魔法纪录·Magia Exedra 魔法少女称呼搜索</div>\s*</div>\s*", "\n", text, count=1)
    text = re.sub(r"data-build=\"[^\"]*\"", f'data-build="{RELEASE}"', text, count=1)
    if "hamburger-menu-v23.js" not in text:
        if "</body>" not in text: raise RuntimeError("public/index.html has no closing body tag")
        text = text.replace("</body>", '\n\t<script src="./myfile/hamburger-menu-v23.js?v=20260820-23" defer></script>\n</body>', 1)
    text = re.sub(r'href="\.\/myfile\/hamburgerMenu\.css(?:\?[^\"]*)?"', 'href="./myfile/hamburgerMenu.css?v=20260820-23"', text)
    text = re.sub(r'<a([^>]*?)target="_blank"(?![^>]*?rel=)([^>]*)>', r'<a\1target="_blank" rel="noopener noreferrer"\2>', text)
    index_path.write_text(text, encoding="utf-8")


def rebuild_csv(path: Path, groups: list[dict[str, Any]]) -> None:
    headers = ["group_id", "category", "source_base", "current_translation", "source_count", "approved_translation", "status", "note", "last_edited_at", "last_edited_by", "child_source_title", "child_current_translation", "child_current_full_translation", "child_story_count", "child_row_count", "child_leaf_count", "child_story_ids", "child_source_suffix", "child_localized_suffix"]
    with path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=headers); writer.writeheader()
        for group in groups:
            for child in group.get("children") or [{}]:
                writer.writerow({"group_id": group.get("group_id", ""), "category": group.get("category", ""), "source_base": group.get("source_base", ""), "current_translation": group.get("current_translation", ""), "source_count": group.get("source_count", 0), "approved_translation": group.get("approved_translation", ""), "status": group.get("status", ""), "note": group.get("note", ""), "last_edited_at": group.get("last_edited_at", ""), "last_edited_by": group.get("last_edited_by", ""), "child_source_title": child.get("source_title", ""), "child_current_translation": child.get("current_translation", ""), "child_current_full_translation": child.get("current_full_translation", ""), "child_story_count": child.get("story_count", 0), "child_row_count": child.get("row_count", 0), "child_leaf_count": child.get("leaf_count", 0), "child_story_ids": "|".join(str(value) for value in child.get("story_ids", [])), "child_source_suffix": child.get("source_suffix", ""), "child_localized_suffix": child.get("localized_suffix", "")})


def main() -> int:
    parser = argparse.ArgumentParser(); parser.add_argument("--repo-root", type=Path, default=Path.cwd()); parser.add_argument("--libs-dir", type=Path, required=True); args = parser.parse_args()
    repo_root = args.repo_root.resolve(); libs_dir = args.libs_dir.resolve()
    group_path = repo_root / "public/data/story-title-groups-v1.json"; localization_path = repo_root / "public/data/story-v7/localization.json"; overrides_path = repo_root / "data/story-title-overrides.json"
    original_groups = read_json(group_path); localization = read_json(localization_path); piece_rows = read_json(libs_dir / "pieceList.json")
    piece_map = {int(row["pieceId"]): str(row["pieceName"]).strip() for row in piece_rows if row.get("pieceId") is not None and row.get("pieceName")}
    character_map, name_replacements = build_character_map(localization); generated_at = now_iso(); parent_translation = {}; overrides = []
    for group in original_groups.get("groups", []):
        target = translate_group(group, piece_map, character_map).strip()
        if not target or has_kana(target): raise RuntimeError(f"parent translation invalid: {group.get('category')} / {group.get('source_base')} => {target}")
        group_id = str(group["group_id"]); parent_translation[group_id] = target
        overrides.append({"group_id": group_id, "category": group.get("category", ""), "source_base": group.get("source_base", ""), "source_sha256": group.get("source_sha256") or sha256_text(str(group.get("source_base", ""))), "approved_translation": target, "status": "已校对", "note": source_note(str(group.get("category", "")), str(group.get("source_base", "")), piece_map)})
    write_json(overrides_path, {"version": 23, "release": RELEASE, "generatedAt": generated_at, "authorityOrder": AUTHORITY_ORDER, "description": "V23 权威源优先的完整母故事覆盖；合法英文、拉丁文和可直接作为中文使用的汉字标题不强行改写。", "overrides": overrides})
    subprocess.run([sys.executable, str(repo_root / "scripts/build-story-title-groups-v1.py")], cwd=repo_root, check=True)
    built = read_json(group_path); by_category = collections.defaultdict(dict); source_by_category = collections.defaultdict(dict); exact_candidates = collections.defaultdict(set); changed_rows = []; unresolved = []
    notes = {item["group_id"]: item["note"] for item in overrides}
    for group in built.get("groups", []):
        group_id = str(group["group_id"]); target = parent_translation[group_id]; previous = str(group.get("current_translation") or group.get("source_base") or "")
        group.update({"current_translation": target, "approved_translation": target, "status": "已校对", "note": notes[group_id], "last_edited_at": generated_at, "last_edited_by": "V23 authoritative pipeline"})
        if previous != target: changed_rows.append({"group_id": group_id, "category": group.get("category", ""), "source_base": group.get("source_base", ""), "before": previous, "after": target, "authority": group["note"]})
        if target == str(group.get("source_base", "")): unresolved.append({"group_id": group_id, "category": group.get("category", ""), "source_base": group.get("source_base", ""), "display_translation": target, "reason": "合法英文/拉丁专名或可直接作为中文使用的汉字标题；按要求不强行改写"})
        for child in group.get("children", []):
            suffix = translate_suffix(str(child.get("source_suffix") or ""), name_replacements)
            if has_kana(suffix): raise RuntimeError(f"child suffix still contains kana: {child.get('source_title')} => {suffix}")
            full_target = join_translation(target, suffix, child)
            if has_kana(full_target): raise RuntimeError(f"child translation still contains kana: {child.get('source_title')} => {full_target}")
            child.update({"current_translation": target, "localized_suffix": suffix, "current_full_translation": full_target})
            category = str(group.get("category", "")); source_title = str(child.get("source_title", "")); by_category[category][source_title] = full_target; source_by_category[category][source_title] = "v23-authoritative"; exact_candidates[source_title].add(full_target)
    category_order = localization.get("categoryOrder") or []; category_rank = {str(value): index for index, value in enumerate(category_order)}
    built["groups"].sort(key=lambda group: (category_rank.get(str(group.get("category", "")), 10000), natural_key(str(group.get("source_base", "")))))
    for group in built["groups"]: group["children"].sort(key=lambda child: natural_key(str(child.get("source_title", ""))))
    built.update({"release": RELEASE, "version": 23, "generatedAt": generated_at}); summary = built.setdefault("summary", {}); summary.update({"groupCount": len(built["groups"]), "childTitleCount": sum(len(group.get("children", [])) for group in built["groups"]), "overrideGroupCount": len(built["groups"]), "approvedGroupCount": len(built["groups"]), "missingLocalizationCount": 0, "missingLocalizationSample": [], "kanaInChineseTranslationCount": 0})
    write_json(group_path, built); write_json(repo_root / "public/downloads/story-title-groups.json", built); rebuild_csv(repo_root / "public/downloads/story-title-groups.csv", built["groups"])
    exact_map = {source: next(iter(targets)) for source, targets in exact_candidates.items() if len(targets) == 1}; exact_sources = {source: "v23-authoritative" for source in exact_map}
    map_payload = {"version": 23, "release": RELEASE, "generatedAt": generated_at, "source": "data/story-title-overrides.json", "summary": {"groupCount": len(built["groups"]), "childTitleCount": sum(len(mapping) for mapping in by_category.values()), "exactTitleCount": len(exact_map), "kanaInChineseTranslationCount": 0}, "titleByCategory": dict(by_category), "titleSourcesByCategory": dict(source_by_category), "titleExact": exact_map, "titleSources": exact_sources}
    write_json(repo_root / "public/data/story-title-map.generated.json", map_payload)
    localization.update({"release": RELEASE, "version": 23, "generatedAt": generated_at, "titleByCategoryV10": dict(by_category), "titleSourcesByCategoryV10": dict(source_by_category), "titleExact": exact_map, "titleSources": exact_sources}); write_json(localization_path, localization)
    authority_counts = collections.Counter(item["note"] for item in overrides)
    write_json(repo_root / "public/data/story-title-authority-v23.json", {"version": 23, "release": RELEASE, "generatedAt": generated_at, "authorityOrder": AUTHORITY_ORDER, "summary": {"groupCount": len(built["groups"]), "childTitleCount": sum(len(group.get("children", [])) for group in built["groups"]), "changedGroupCount": len(changed_rows), "preservedUnchangedCount": len(unresolved), "kanaInChineseTranslationCount": 0, "authorityCounts": dict(sorted(authority_counts.items()))}, "changes": changed_rows})
    write_json(repo_root / "public/data/story-title-unresolved-v23.json", {"version": 23, "release": RELEASE, "generatedAt": generated_at, "summary": {"count": len(unresolved), "kanaCount": 0, "description": "这些项目不是漏译：仅保留合法英文/拉丁专名或无需改写的汉字标题。"}, "items": unresolved})
    write_json(repo_root / "public/data/story-title-changes-v23.json", {"version": 23, "release": RELEASE, "generatedAt": generated_at, "summary": {"count": len(changed_rows)}, "items": changed_rows})
    write_json(repo_root / "public/v23-build-marker.json", {"release": RELEASE, "generatedAt": generated_at, "groupCount": len(built["groups"]), "childTitleCount": sum(len(group.get("children", [])) for group in built["groups"]), "kanaInChineseTranslationCount": 0})
    patch_index(repo_root / "public/index.html")
    index_text = (repo_root / "public/index.html").read_text(encoding="utf-8")
    if "魔法纪录·Magia Exedra 魔法少女称呼搜索</div>" in index_text or "hamburger-menu-v23.js" not in index_text: raise RuntimeError("V23 index patch failed")
    all_kana = [(category, source, target) for category, mapping in by_category.items() for source, target in mapping.items() if has_kana(target)]
    if all_kana: raise RuntimeError(f"{len(all_kana)} generated Chinese titles still contain kana: {all_kana[:20]}")
    print(json.dumps({"release": RELEASE, "groups": len(built["groups"]), "children": sum(len(group.get("children", [])) for group in built["groups"]), "changedGroups": len(changed_rows), "preservedUnchanged": len(unresolved), "kanaInChineseTranslations": 0}, ensure_ascii=False)); return 0


if __name__ == "__main__":
    raise SystemExit(main())
