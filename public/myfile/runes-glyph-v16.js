/* V16: deterministic glyph-template recognition for isolated Madoka-rune lines.
 *
 * V14 removes the illustration/decorative background.  This module then
 * classifies each isolated glyph against embedded templates extracted from the
 * registered MadokaRunes chart.  A small canonical-rune lexicon performs normal
 * OCR word-level correction when several distressed glyphs are individually
 * ambiguous; arbitrary non-lexicon lines still return the raw glyph result.
 */
(function (global) {
  'use strict';
  const RELEASE = 'rune-glyph-template-v16-20260818';
  const SIZE = 64;
  const TEMPLATE_PACK = {"a":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACADwAAAAAAAPB/AP4AAAAA+P/x/w8AAAD8////HwAAAL7///9/AAAADv7///8AAAAH/P///wMAAAP4////BwCAA/j///8PAIAB+P///w8AgAD4////HwCAAPj///8/AAAA+P///z8AAAD4////fwAAAPz/////AAAA/P////8AAAD+/////wAAAP//////AQCA//////8BAMD//////wEA4P//////AQDw+P////8BABj4/////wEAAPD/////AQAA8P////8BAADw/////wEAAPD/////AQAA8P////8BAADw/////wEAAPD/////AQAA8H/A//8BAPDnH4D//wEA+OcPAP7/AQD87wcA/v8BAPz/AwD8/wEA/u8DAPj/AAD+7wEA+P8AAP7vAQD4/wAA/u8BAPj/AAD+7wEA+H8AAP7vAQD4fwAA/OcBAPg/AAD85wEA+D8AAPzvAQD8HwAA+O8BAP4fAAD4HwAA/w8AAPD/AMD/DwAA4P8H+P8HAADA/////wMAAID/////AQAAAP7//38AAAAA/P//PwAAAADw//8fAAAAAMD//wMAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=","b":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAMAfAAAAAAAA/P8DAAAAAID//w8AAAAA4P//PwAAAADw//9/AAAAAPj///8AAAAA/P///wEAAAD+////AwAAAP////8HAACA/////w8AAID/////DwAAwP////8fAADg/////38AAPD/////fwAA8P//////AADw//////8AAPD//////wAA+P//////AQD4//////8BAPj//////wEA+P//////AwD4//////8DAPj//////wMA+P//////AwD4//////8DAPj//////wMA+P//////AwD4//////8BAPj//////wEA8P//////AQDw//////8BAPD//////wAA8P8/z///AADw/w+P/38AAPD/Bw//fwAA8P8DD/4/AADv/////x8AwOf/////HwDA5/////8PAODj/////+cB4MP/5///5wPgz/8DD//DB+D//+8f//8H4P///////wfA////////B4D///////8HAP///////wcAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=","c":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAwAAAAAAAAADgAQAAAAAAAIAfAAYAAAAAAP//BwAAAAAA/v8PAP//BwD8/w8A//8HAPz/CwD//wcA+P8BAPj/AwD4/wEA4P8DAPj/AQDg/wMA8P8AAOD/AwDw/wAAwP8BAPD/AADA/wEA8P8AAMD/AQDw/wAAwP8BAPD/AADA/wEA8P8AAMD/AQDwfwAAwP8BAPB/AADA/wEA8H8AAMD/AQDw/wAAwP8BAPD////P/wEA8P///9//AQDw//////8BAPD/+B///wEA8P/wD/7/AQDw//AP/v8BAPD/98///wEA8P/3j8//AQDwf/AP4P8BAPh/8A/g/wEA+H/wD+D/AQD4f/AP4P8BAPh/8A/g/wEA+H/4D/D/AQD4//8/+P8BAPj//////wEA/P//////AwD8//////8HAP///////wMAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=","d":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgAcAAAAAAADwHwAAAAAAAPg/AAAAAAAA/n8AAAAAAAD+fwAAAAAAAJ//////fwCAD///////AYAH//////8AgAP+////PwCAAf7///8/AIAA/v///x8AAAD+////HwAAAP////8fAAAA/////x8AAAD/////HwAAgP////8fAADA/////x8AAP//////DwCA//////8fAMD7/////x8AwOD/////HwAAwP////8/AADA/////z8AAMD//////wAAwP//////AwDA//////8DAMD//////wEAwP////9/AADA/wEAAAAAAMD/AAAAAAAAwP8AAAAAAADA/wAAAAAAAMD/AAAAAAAAwP8AAIAeAADA/////z8AAMD//////wAAwP//////AADA//////8AAMD//////wAAwP////9/AADA/wCA/38AAMB/AAD+fwAAwH8AAP5/AADAfwAA/n8AAMB/AAD+fwAAwH8AAP7/AOD//wAA//8BwP///4D//wOA////wf//BwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=","e":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIAfAAAAAAAA/P8DAAAAAID//w8AAAAA4P//HwAAAAD4//8/AAAAAPz///8AAAAA/v///wEAAID/////AwAAwP////8HAADg/////w8AAPD/////HwAA+P////8/AAD4/////38AAPz/////fwAA/v//////AAD///////8BAP///////wEA////////AYD///////8DgP///////wOA////////A8D///////8DwP///////wPA////////A8D///////8DwP////j//wPA//8fwP//A8D//wOA//8DwP//AQD//wPA//8BD///A8D//4D///8DwP//wP///wPA/3/g////A8D/f+D///8DwP9/8P///wOA/3/w//H/A4D/P/D/8f8DgP9/8P/x/wOA/3/g//j/AwD/f+B/+P8DAP//wH98/wEA/v8BAD7/AAD8/wMAP/8AAPz/D8CffwAA+P9/8J9/AADw////3z8AAOD////vPwAAwP///+MfAAAA////8Q8AAAD+/3/8BwAAAPD/D/4DAAAAAP8A/wAAAAAAAIA/AAAAAAAA8A8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=","f":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAPgAAAAAAACA/w8AAAAAAPD/fwAAAAAA+P//AAAAAAD8//8BAAAAAP///wcAAACA////DwAAAMD///8PAAAA4P///x8AAADg////PwAAAPD///8/AAAA+P///z//BwD8////v/8DAPz///9//wEA/P//////AQD+///8//8AAP7/H/D//wAA/v8PwP9/AAD+/weA/38AAP7/AwD/fwAA/v8BAP5/AAD+/wEA/H8AAP7/AQD4fwAA/v8AAPh/AAD+/wEA8H8AAP7/Afj/fwAA/v8D/P9/AAD+/wOA/38AAPz/D/D/fwAA/P////9/AAD8/////38AAPj/////fwAA+P////9/AAD4/////38AAPD/////fwAA8P8DAPx/AADg/wEA8H8AAMD/AwDwfwAAwP8DAPB/AACA/wcA4H8AAID/BwDgfwAAgP8PAPB/AACA/x8A8H8AAMD/PwDwfwAA4P//APj/AMD////g//8A4P//f/z//wDA//9//P//AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=","g":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA8P8DAAAAAAD///9/AAAAAP7//38AAAAA/P//fwAAAAD8//9/AAAAAPz//z8AAAAA/P//PwAAAAD8//8/AAAAAPj//z8AAAAAAP7/PwAAAAAA/v8/AAAAAAD+/z8AAAAAAP7/PwAAAAAA/v8/AAAAAAD+5z8AAAAAAP7BPwAAAAAA/4w/AAAAAAD/vj8AAAAAAP8/PwAAAAAAfz8/AAAAAAB/Pz8AAAAAAH9/PwAAAAAAP38/AAAAAAA/fz8AAAAAAD9/PwAAAAAAv38/AAAAAAC/fz8AAAAAAL9/PwAAAAAAv38/AAAAAAC/fz8AAAAAAL8/PwAAAAAAvz8/AAAAAAC/Pz8AAAAAAL+/PwAAAAAAv78/AAAAAAC/vz8AAAAAAL+fPwAAAAAAP98/AAAAAAA/zz8AAAAAAH/vPwAAAAAAf+c/AAAAAAD/+D8AAAAAAP//PwAAAAAA//8/AAAAAAD//z8AAAAAAP//PwAAAAAc//8/AAAAADz//z8AAAAAPP//PwAAAAA4//8/AAAAADj//z8AAAAA/P//PwAAAAD8//8/AAAAAP7//38AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=","h":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB/AAAAAAAAAP//////fwAA/v////9/AAD8/////z8AAPz/////HwAA/v////8PAAD8/////wcAAID/////BwAAAP////8DAAAA/////wMAAAD/////AQAAAP////8BAAAA/v///wEAAAD+////AQAAAP7///8BAAAA/v///wMAAAD+////AwAAAP7///8HAAAA/v///wcAAAD++///HwAAAP7x//8/AAAA/vH/Dz4AAAD+8f8PAAAAAP7w/w8AAAAA/vD/BwAAAAD+8P8HAAAAAP/w/wcAAAAA//D/BwAAAID/8P8HAAAA/P/w/2MAAAD+f/D/8wEAAP5/8P/zAwAA+D/w//MDAADgD/D/8wcAAAAA8P/3BwAAAADw/8cHAAAAAPD/xw8AAAAA8P/PDwAAAAD4/88PAABgAPj//wcAAHgA+P//BwAAPgD8//8DAAAeAP7//wMAAB4A/v//AQAAHoD//38AAAA+wP//AQAAAP7///8BAAAA/v///wEAAAD8////AQAAAPz///8BAAAA+P///wEAAADw////AQAAAOD///8BAAAAgP///wEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=","i":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAwP8AAAAAAADA////fwAAAOD///9/AAAAAP///38AAAAA4P//PwAAAACA//8PAAAAAID//wMAAAAAgP//AQAAAAAA//8AAAAAAAD/fwAAAADwAP8/AAAAAPwH/x8AAAAA/h//DwAAAID/P/8HAAAAgP9//wMAAADA////AwAAAMD///8BAAAA4P///wAAAADw//9/AAAAAPD//38AAAAA8P//PwAAAADw//8/AAAAAPj//x8AAAAA+P//DwAAAAD4//8PAAAAAPj//wcPAAAA+P//xz8AAAD4///n/wAAAPj///f/AwAA+P//8/0HAAD4///78A8AAPj///vgDwAA+P/5e8MfAAD4//n7zz8AAPj/+fvfPwAA+P/4+99/AAD4//jz338AAPj/+OPPfwAA+P/4x+d/AAD4//AH4X8AAPj/8B/wfwAA+P/wP/x/AADw//D//38AAPD/8P//fwAA8P/g//9/AADw/+D//38AAPD/wP//fwAA8P/A//9/AADw/4D//z8AAPD/gf//HwAA8P8D//8PAAD8/z///wcAAP7/////AwAA//////8BAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=","j":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD4//9/AAAAAPD//z8AAAAA4P//HwAAAADA//8PAAAAAID//wcAAAAAAP//BwAAAAAA//8DAAAAAAD+/wMAAAAAAP7/AwAAAAAA/P8BAAAAAAD8/wEAAAAAAPz/AQAAAAAA/P8AAAAAAAD8/wAAAAAAAPz/AAAAAAAA/P/8BwAAAAD8//8fAAAAAPz//z8AAAAA/P//fwAAAAD8/4//AAAAAPz/B/8BAAAA/P8D/wEAAAD8/+H/AwAAAPz/+f8DAAAA/P/8/wcAAAD8//z/BwAAAPz//v8PAAAA/H/+/w8AAAD8f/z/DwAAAPx//P8PAAAA/H/8/w8AAAD8//j/DwAAAPz/8P8PAAAA/P8A/w8AAAD8/4H/DwAAAPz/g/8PAAAA/P///w8AAAD8////DwAAAPz///8PAAAA/P///w8AAAD8////DwAAAPz///8HAAAA/P///wcAAAD8////BwAAAPz///8DAAAA+P///wMAAAD4////AQAAAPD///8BAAAA8P///wAAAADg//9/AAAAAMD//z8AAAAAAP//HwAAAAAA/v8HAAAAAADw/wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=","k":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIDw//8HAPz///D//wcA////4P//B8D//3/A//8BwP//f4D//wDg//9/gP9/AOD//3+A/38A4N///8D/fwDgD/7/4/9/AOAP/P///38A4I/8////fwDA//z///8/AMD//P///z8AgH/4////PwAAP/j///8/AAAc+P+D/z8AAAD4/4P/PwAAAPj/g/8/AAAA+P+T/z8AAAD4////PwAAAPj///8/AAAA+P///z8AAAD4////PwAAAPj///8/AAAA+P///z8AAAD4////PwAAAPj///8/AAAA+P+//z8AAAD4/4P/PwAAAPj/g/8/AAAA+P+D/z8AAAD4/4P/PwAAAPj///8/AAAA+P///z8AAAD4////PwAA8P3///8/AAD8/////z8AAHz/////PwAAPvz///8/AAA+/P///z8AAH78/4P/PwAA/v//g/8/AAD+//+D/z8AAP///4P/PwAA/v//x/8/AAD+/////z8AAP7/////PwAA/v////8fAAD+/3/8/x8AAPz/P/D/DwAA+P8f4P8PAADw/w/A/wcAAMD/BwD/AQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=","l":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA4H8AAAAAAADw//8PAAAAAPD//wcAAAAA+P//AwAAAAD4//8AAAAAAPz4/wAAAAAA/Pj/AAAAAAB8+P8AAAAAAPz8/wAAAAAA+Pz/AAAAAAD4+f8AAAAAAPD7/wAAAAAAwP//AAAAAAAA+P8AAAAAAAD4/wAAAAAAAPz/HAAAAAAA/P9/AAAAAAD4//8AAAAAAPj//wEAAAAA+P//AQAAAAD4//8BAAAAAPj//wEAAAAA+P//AQAAAAD4//8BAAAAAPj//wEAAAAA+P//AQAAAAD4//8AAAAAAPj/HwAAAAAA+P8AAAAAAAD4/wAAAAAAAPj/AAAAAAAA+P8AAAAAAAD4/xAAAAAAAPj//gAAAAAA+P//AQAAAAD4//8DAAAAAPj//wMAAAAA+P//AwAAAAD4//8DAAAAAPj//wMAAAAA+P//AwAAAAD4//8BAAAAD/z//wEAAMA//P//AAAAwH/8/z8AAADgb/z/AAAAAOAH/P8AAAAA4Af+/wAAAADgj///AAAAAOD///8AAAAA4P///wAAAADA////AQAAAID///8DAAAAAP7//wcAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=","m":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAPD/AQAAAAAA/v8HAAAAAAD//x8AAAAAwP//fwAAAADg////AAAAAPjj//8BAAAAfMD//wMAAAAeAP//BwAAAA8A/v8PAACAB174/x8AAMDn//v/HwAAwP////8/AADg/////38AAPD/A/z/fwAA8P8A4P//AAD4fwDA//8AAPg/AAD//wAA/B8AAP//AQD+D/gf/v8BAP4H/D/+/wEA/gf+f/7/AQD/B/7//v8BAP8H/////wEA/wf/////AQD/B/////8BgP8H/////wGA/wf+////AYD/D/7///8BgP8P/P///wGA/x/4////AYD/P+D///8BgP9/APz//wGA//8A////AYD//4H///8BgP///////wEA////////AQD///////8BAP///////wEA/v//////AQD+//////8AAP7//////wAA/P//////AAD4/////38AAPj/////fwAA8P////8/AADw/////x8AAOD/////HwAAwP////8PAACA/////wcAAAD/////AwAAAP7///8BAAAA+P//fwAAAADw//8fAAAAAMD//wMAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=","n":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP8/AAAAAADg//8BAAAAAPj//wcAAAAA/v//PwAAAID///9/AAAAwP////8BAADg/////wcAAOD/////DwAA8P////8fAAD4/////x8AAPj/////PwAA/P////9/AAD8/////38AAP7/////fwAA/v////9/AAD+/////38AAP//////fwAA//////9/AAD//////38AAP///n//fwAA/z/+f/5/AAD/D////H8AAP8D///4fwAA/gP///B/AAD+Af//8H8AAP4B///gPwAA/gD//+A/AAD8AP//4D8AAPwB///wHwAA+AH+f/APAAD4A/x/+A8AAPAP/B/8BwAA4P/wj/8DAADA/4CB/wAAAAAfAAA+AAAAAACAAAAAAAAAAPgfAAAAAAAA/D8AAAAAAAD+P9AAAAAAAP5//AEAAAD//n//AwAAgP//f/8DAACAP/9//QMAAIA//n/8AwAAwD/+f/wDAADAf/4//gMAAID//r//AwAAgP////8BAACA/////wEAAAD/////AAAAAP7//38AAAAA/P//PwAAAADw//8PAAAAAMD//wMAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=","o":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAPD/AQAAAAAA/v8PAAAAAAD//x8AAAAAwP//fwAAAADg//9/AAAAAPD///8AAAAA+P///wEAAAD4////AQAAAPz///8DAAAA/D/8/wMAAAD+A/D/AwAAAP4BwP8DAAAA/uDP/wMAAAD++J//AwAAAH78P/8DAAAAfv5//wMAAAB+/n/+AwAAAH7/f/4DAAAAfv9//gMAAAB+/3/+AwAAAP7/f/8DAAAA/v9//wMAAAD8+z//AwAAAPz3v/8DAAAA+Oef/wMAAAD438//AwAAAPD/5/8DAAAAAH/4/wEAAAAACP7/AAAAAADg/38AAAAAAP//fwAAAADg//8/AAAAAPj//x8AAAAA/P//PwAAAAD+z/9/AAAAAP/n//8AAACA//P//wEAAID/+f//AwAAwP/4//8DAADA//j//wMAAOD//P//AwAA4P/8//8DAADg//z//wMAAOD/+P//AwAA4P/43/8DAADg//HP/wMAAOD/4///AwAA4P////8DAADA/////wMAAMD/////AwAAwP////8BAACA/////wEAAAD/////AAAAAPz//z8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=","p":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAMRhAwAAAAAA/P8/AAAAAAD8/z8AAAAAAAj+DwAAAAAAAPgHAAAAAAAA+AcAAAAAAAD4BwAAAAAAAPgHAAAAAAAA+AcAAAAAAPD/BwAAAAAA/P8HAAAAAAD//w8AAAAAwP//PwAAAADg//9/AAAAAPj///8AAAAA/P///wEAAAD+P/D/AwAAAP8P4P8DAAAA/wfA/wMAAID/A4D/BwAAgP8DgP8HAACA//GB/wcAAMD//QP/BwAAwP/8B/8HAADA//wP/wcAAOB//A//BwAA4H/+D/8HAADgf/4P/wcAAOB//o//BwAA4H/+j/8HAADgf/yP/wcAAOD//Of/BwAAwP/88/8HAADA//3//wcAAMD//f//AwAAgP/z//8DAACA/4ff/wEAAAD/H+D/AAAAAP///38AAAAA/v//PwAAAAD8//8fAAAAAPD//wcAAAAA4P//AwAAAACA//8DAAAAAAD//wMAAAAAAH/4AwAAAAAAf/gDAAAAAIB/+AMAAAAAgH/4AwAAAADAf/gDAAAAAOD/+AcAAAAA8P//DwAAAAD8//8/AAAAAP7//38AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=","q":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAZogAmAAAAID/////AAAAAP////8AAAAA/v///wAAAAD+///3AAAAAB7//+EAAAAADv7/wAEAAAAO/H+AAAAAAA74fwAAAAAADPh/AAAAAAAA+H8AAAAAAAD4fwAAAAAAAPh/AAAAAAAA+H8AAAAAAAD4fwAAAAAAAPh/AAAAAAAA+H8AAAAAAAD4fwAAAAAAAPh/AAAAAAAA/H8AAAAAAAD//wEAAAAAgP//AwAAAADg//8PAAAAAPj//x8AAAAA+P//PwAAAAD+////AAAAAP7///8AAAAA/////wEAAID/////AQAAgP////8DAADA/////wMAAMD/////AwAAwP/z3/8DAADg/+PP/wMAAOD/w8f/AwAA4P/Dw/8DAADg/8fn/wMAAOD/x+P/AwAA4P/P//8DAADg/9///wMAAOD/////AwAAwP////8DAADA/////wMAAMD/////AwAAwP////8DAACA/////wEAAID/////AQAAAP////8AAAAA/v//fwAAAAD8//8/AAAAAPj//x8AAAAA8P//DwAAAADA//8HAAAAAAD//wEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=","r":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAOAHAAAAAAAA+B8AAAAAAHj8PwAAAAAA8P1/AAAAAADw/X8AAAAAAPD9fwAAAAAA+P1/AAAAAAD4/n8AAAAAAPj8fwAAAAAA/Pw/BwAAAAD8/D9/AAAAAPz8H/8HAAAA/v0P/wcAAAD+8YP/BwAAAP4DwP8AAAAA/gPw/wAAAAD+B/x/AAAAAP7//38AAAAA/P//fwAAAAD8//8/AAAAAPz//z8AAAAA+P//PwAAAAD4//8/AAAAAPD//z8AAAAA4P//PwAAAADg//8/AAAAAID//x8AAAAAAID/HwAAAAAAAP8fAAAAAAAA/x8AAAAAAAD/HwAAAAAAAP8fAAAAAAAA/x8AAAAAAAD/HwAAAAAAAP8fAAAAAAAA/x8AAAAAAAD/HwAAAAAAAP8fAAAAAAAA/x8AAAAAAID/HwAAAAAAgP8fAAAAADzA/x8AAAAAPuD/HwAAAAA+8P8fAAAAAP79/x8AAAAA/v//HwAAAAD+//8fAAAAAP7//z8AAAAA////PwAAAAD///8/AAAAgP///z8AAADA////PwAAAOD///9/AAAA4P///38AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=","s":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAwD8AAAAAAADg/wAAAAAAAPD/AAAAAAAA+P8BAAAAAAD4/wEAAAAAAPz/AQAAAAAA/P8BAAAAAAD8/wEAAAAAAPz/AQAAAAAA+P8BAAAAAAD4/wEAAAAAAPD/AQAAAAAA4P8BAAAAAADA/wEAAAAAAIP/AAAAAAAA/38AAAAAAAD+PwAAAAAAAOADAAAAAAAAAAAAAAAAAAAAAAAAAAAAAMAfAAAAAAAA8H8AAAAAAAD4fwAAAAAAAPz/AAAAAAAA/v8BAAAAAAD+/wEAAAAAAP7/AQAAAAAA/v8BAAAAAAD+/wEAAAAAAP7/AQAAAAAA/P8AAAAAAAD8/wAAAAAAAPB/AAAAAAAA4D8AAAAAAAD4DwAAAAAAAAAAAAAAAAAAAAAAAAAAAADAHwAAAAAAAOB/AAAAAAAA8H8AAAAAAAD4/wAAAAAAAPj/AAAAAAAA+P8AAAAAAAD4/wAAAAAAgPn/AAAAAACA+f8AAAAAAID5/wAAAAAAgPv/AAAAAACA838AAAAAAID/fwAAAAAAAP8/AAAAAAAA/h8AAAAAAAD8BwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=","t":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADQAAAAAAAAAPD/P1AAAAAA8P8/+P8PAADg/z/4/w8AAOD/P/D/DwAA4P+/8P8PAADA///3/wcAAAD//+//AwAAAP//n/8BAAAA//+//wEAAAD//7//AQAAAP/9v/8AAAAA//2//wAAAAD//b//AAAAgP/8n/8AAACA//yf/wAAAID/+I//AQAAgH/Agf8BAADAfwCA/wEAAMB/AID/AQAAwH8AgP8BAADAfwCA/wEAAMB/AID/AQAAwH8AgP8BAADgfwCA/wEAAOB/AID/AQAA4H8AwP8DAADgfwDA/wMAAOB/AMD/AwAA4P8A4P8DAADg/wDg/wMAAOD/AfD/AwAA4P8B8P8DAADg/wP4/wMAAOD/A/z/AwAA4P8P//8DAADg/////wMAAOD/////AQAA4P////8BAADg/////wEAAMD/////AQAAwP////8AAADA////fwAAAID///9/AAAAgP///z8AAACA////PwAAAAD///8fAAAAAP7//w8AAAAA/v//DwAAAAD8//8HAAAAAPj//wEAAAAA8P//AAAAAADA/38AAAAAAID/PwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=","u":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIAHAAAAAAAA+H8AAAAAAAD+/wEAAAAAAP//AwAAAADA//8PAAAAAOD/6Q8AAAAA8P/AHwAAAAD4fwA/AAAAAPg/AD8AAAAA/B8APwAAAAD+HwB/AAAAAP8PfH8AAAAA/wf+fwAAAAD/B/8/AAAAgP8D/z8AAACA/wP/PwAAAMD/gf8/AAAAwP+B/x8AAADA/4D/DwAAAOD/AP8PAAAA4P8A/wcAAADg/wD+AwAAAOD/APgA/v8H4P8AAAD+/wfg/8AEPfz/A+D/wP8/AP8B4P+A/w8f/gDg/wD/wz/+AOD/Af7Df/4A4P8B/uP//gDg/wH+4//+AOD/A/7z//4A4P8D/vP//gDA/wf+8///AMD/H/7z//8AgP8//vP//wCA////8///AAD///////8AAP//////fwAA/v////9/AAD+/////38AAPz/////fwAA+P////8/AADw/////z8AAOD/////HwAAwP////8PAAAA/////wcAAAD8////AQAAAPD//38AAAAAgP//DwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=","v":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/wAAAAAAAMD/AwAAAAAA4P8DAAAAAADw/wcAAAAAAPD/BwAAAAAA+P8PAAAAAAD4/w8AAAAAAPz/DwAAAAAA/P8PAAAAAAD8/x8AAAAAAPz/DwAAAAAA/P8PAAAAAAD8/w8AAAAAAPz/DwAAAAAA+P8PAAAAAAD4/w8AAAAAAPD/DwAAAAAA4P8fAAAAAAAA4D8AAAAAAACAPwAAAAAAAAB/AAAAAAAAAP4AAAAAAAAA/AAAAAAAAAD4AAAAAAAAAPgAAAAAAAAA8AEAAAAAAADgAwAAAAAAAOADAAAAAAAAwAcAAAAAAACADwAAAAAAAIAfAAAAAAAAAB8AAAAAAAAAPwAAAAAAAAB/AAAAAAAAAH4AAAAAAAAA/gAAAAAAAAD4/wcAAAAAAPj/DwAAAAAA8P8fAAAAAADg/x8AAAAAAOD/HwAAAAAA8P8fAAAAAADw/x8AAAAAAPD/HwAAAAAA8P8fAAAAAAD4/x8AAAAAAPj/HwAAAAAA+P8fAAAAAADw/x8AAAAAAPD/HwAAAAAA8P8fAAAAAADg/w8AAAAAAOD/DwAAAAAAwP8DAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=","w":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADw/wEAAAAAAPz//wAA/gMA/v//f///AwA/8P////8AgA8A/P///wCA5weA////AcDzDwD+//8DwPsfAPj//wLA+x8A8P8/AMD/H3zg/x8AwP8//8H/DwDA/z//w/8PAMD/n//H/wcAgP/f/4//BwCA/+//j/8DAAD/5/+f/wMAAP7z/5//AwAA4PD/n/8BAAAA+P+//wEAAAD8/7//AQAAAPz/n/8BAAAA/P+f/wEAAAC8/9//AQAAALz/z/8BAAAAPv/H/wEAAAA+/+f/AQAAADz/4f8BAAAAPDjw/wEAAAA8APj/AQAAADwA/P8BAAAAfAD//wEAAAD4wP//AQAAAPjz//8BAAAA8P///wEAAADA//3/AQAAAIB//P8BAAAAAAD//wAAAAAAgP//AAAAAADg//8AAAAAwP7//wAAAADg////AAAAAOD//38AAAAAwP//fwAAAAAA//9/AAAAAAD+/z8AAAAAAP7/PwAAAAAA/v8/AAAAAAD+/x8AAAAAAP//DwAAAAAA//8PAAAAAID//wcAAAAAwP//AwAAAADw//8BAAAAAPD//wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=","x":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB/AAAAAAAAAP////8DAAAA/////z8AAAD+/////wAAAPz/////AQAA/P////8DAAD8/////wcAAPz/////DwAA/P////8fAAD8/////x8AAPz/B/7/PwAA/P/z/P8/AAD+//n5/38AAO7//PP/fwAA5n/89/9/AADmf/73/38AAOJ//uf//wAA4D/+5///AADgP//n//8AAOA//+f//wAA4B//5///AADgH//n//8AAOA//+f//wAA4D//9///AADgP//3/38AAOA///P/fwAA8D/++/9/AADwf/79/z8AAPD//Pz/PwAA8P8x//8/AAD4/wf//x8AAPj/////HwAA+P////8PAAD8/////wcAAPz/////BwAA/v////8DAAD//////wEAgP//////AADA//////8AAOD//z//fwAAAAAAgP8fAAAAAADg/w8GAAAAAPD/Bw8AgAcA/v/DDwAA//////gfAAD///9//x8AAP//////PwAA//////9/AAD+//////8AAP///////wEA////////B4D///////8HwP///////wcAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=","y":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgP8HAAAAAADg/z8AAAAAAPj//wAAAAAA/P//AQAAAAD///8HAAAAgP///w8AAADA////HwAAAMD///8/AAAA4P///38AAADw/////wAAAPD/////AAAA+P////8BAAD8/////wEAAPz/////AQAA/v////8DAAD+/////wMAAP//////AwAA//////8HAID//////wcAgP//////BwCA//////8HAMD//////wcAwP//////BwDA//////8PAMD//////w8A4P//B///DwDg//8D/v8PAOD//4H//w8A4P//4P//DwDg///w//8PAOD/f/j//w8A4P9//P//BwDg/3/8/P8HAOD/P/z4/wcA4P8//Pv/BwDg/z/8+/8HAOD/P/z3/wcA4P8//P//AwDg/z/4+/8DAOD/P/D7/wMA4P8/wPn/AwDA/z8A/P8BAMD/PwD8/+EBwP8/APz/8QOA/z94/v/5A4D/P/z+//0DgP8//P///AMA/3/+///8AwD///7///wDAP7//////AMA/P/////8AwD4//////8BAPD//////wAA4P////9/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=","z":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIAAAHwAAAAD8AcA/AAAAAP4H4H8AAAAA/wfg/wAAAAD/B+B/fAAAP/8H4H/+AYA/fwfg/v8BwH//B+D+/wPgf/8HgP7/A+D//wIA/v8D8P//AAD+/wfw//8AAP7/B+D//gAA/v8D4P//AAD+/wPAP/8AAP7+AQC//wAA/n0AAMD/AAD+AQAA/P8AAP7//////wEA/v//////AQD+//////8BAP///////wGA////////AcD///////8BwP///////wGA////////AAD+/////w8AAPj///8/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="}
;
  const LETTERS = 'abcdefghijklmnopqrstuvwxyz';
  const LEXICON = Object.freeze([
    'charlotte', 'ichtotemich',
    'gertrud', 'suleika', 'kirsten', 'albertine', 'gisela', 'elsamaria',
    'uhrmann', 'izabel', 'patricia', 'roberta', 'walpurgisnacht',
    'oktaviavonseckendorff', 'kriemhildgretchen'
  ]);

  function makeCanvas(width, height) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width));
    canvas.height = Math.max(1, Math.round(height));
    return canvas;
  }

  function unpack(base64) {
    const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
    const mask = new Uint8Array(SIZE * SIZE);
    for (let index = 0; index < mask.length; index += 1) {
      mask[index] = (bytes[index >> 3] >> (index & 7)) & 1;
    }
    return mask;
  }

  function otsu(histogram, total) {
    let sum = 0;
    for (let i = 0; i < 256; i += 1) sum += i * histogram[i];
    let weight = 0;
    let partial = 0;
    let maximum = -1;
    let best = 127;
    for (let threshold = 0; threshold < 256; threshold += 1) {
      weight += histogram[threshold];
      if (!weight) continue;
      const foreground = total - weight;
      if (!foreground) break;
      partial += threshold * histogram[threshold];
      const backgroundMean = partial / weight;
      const foregroundMean = (sum - partial) / foreground;
      const between = weight * foreground * (backgroundMean - foregroundMean) ** 2;
      if (between > maximum) { maximum = between; best = threshold; }
    }
    return best;
  }

  function binaryFromCanvas(source) {
    const context = source.getContext('2d', { willReadFrequently: true });
    const rgba = context.getImageData(0, 0, source.width, source.height).data;
    const gray = new Uint8Array(source.width * source.height);
    const histogram = new Uint32Array(256);
    const edge = [];
    const step = Math.max(1, Math.floor(Math.max(source.width, source.height) / 500));
    for (let index = 0, offset = 0; index < gray.length; index += 1, offset += 4) {
      const value = Math.round(rgba[offset] * .2126 + rgba[offset + 1] * .7152 + rgba[offset + 2] * .0722);
      gray[index] = value;
      histogram[value] += 1;
    }
    for (let x = 0; x < source.width; x += step) edge.push(gray[x], gray[(source.height - 1) * source.width + x]);
    for (let y = 0; y < source.height; y += step) edge.push(gray[y * source.width], gray[y * source.width + source.width - 1]);
    edge.sort((a, b) => a - b);
    const threshold = otsu(histogram, gray.length);
    const edgeMedian = edge[Math.floor(edge.length / 2)] ?? 255;
    const lightForeground = edgeMedian < threshold;
    const mask = new Uint8Array(gray.length);
    for (let index = 0; index < gray.length; index += 1) {
      mask[index] = lightForeground ? Number(gray[index] >= threshold) : Number(gray[index] <= threshold);
    }
    return { mask, width: source.width, height: source.height, threshold, lightForeground };
  }

  function verticalSegments(binary) {
    const { mask, width, height } = binary;
    const activeThreshold = Math.max(2, Math.round(height * .015));
    const raw = [];
    let start = -1;
    for (let x = 0; x <= width; x += 1) {
      let count = 0;
      if (x < width) for (let y = 0; y < height; y += 1) count += mask[y * width + x];
      const active = count >= activeThreshold;
      if (active && start < 0) start = x;
      if (!active && start >= 0) { raw.push({ left: start, right: x - 1 }); start = -1; }
    }
    return raw.filter((item) => item.right - item.left + 1 >= Math.max(3, Math.round(width * .002)));
  }

  function closeMask(mask, width, height, radius) {
    if (!radius) return mask.slice();
    const dilated = new Uint8Array(mask.length);
    for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
      let value = 0;
      for (let dy = -radius; dy <= radius && !value; dy += 1) {
        const ny = y + dy;
        if (ny < 0 || ny >= height) continue;
        for (let dx = -radius; dx <= radius; dx += 1) {
          const nx = x + dx;
          if (nx >= 0 && nx < width && mask[ny * width + nx]) { value = 1; break; }
        }
      }
      dilated[y * width + x] = value;
    }
    const eroded = new Uint8Array(mask.length);
    for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
      let value = 1;
      for (let dy = -radius; dy <= radius && value; dy += 1) {
        const ny = y + dy;
        if (ny < 0 || ny >= height) { value = 0; break; }
        for (let dx = -radius; dx <= radius; dx += 1) {
          const nx = x + dx;
          if (nx < 0 || nx >= width || !dilated[ny * width + nx]) { value = 0; break; }
        }
      }
      eroded[y * width + x] = value;
    }
    return eroded;
  }

  function bounds(mask, width, height) {
    let left = width, right = -1, top = height, bottom = -1;
    for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
      if (!mask[y * width + x]) continue;
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
    }
    return right < left ? null : { left, right, top, bottom };
  }

  function normalizeGlyph(mask, width, height, xScale = 1, yScale = 1, closeRadius = 0) {
    const closed = closeMask(mask, width, height, closeRadius);
    const box = bounds(closed, width, height);
    const output = new Uint8Array(SIZE * SIZE);
    if (!box) return output;
    const sourceWidth = box.right - box.left + 1;
    const sourceHeight = box.bottom - box.top + 1;
    const virtualWidth = Math.max(1, sourceWidth * xScale);
    const virtualHeight = Math.max(1, sourceHeight * yScale);
    const pad = 5;
    const scale = Math.min((SIZE - pad * 2) / virtualWidth, (SIZE - pad * 2) / virtualHeight);
    const targetWidth = Math.max(1, Math.round(virtualWidth * scale));
    const targetHeight = Math.max(1, Math.round(virtualHeight * scale));
    const offsetX = Math.floor((SIZE - targetWidth) / 2);
    const offsetY = Math.floor((SIZE - targetHeight) / 2);
    for (let ty = 0; ty < targetHeight; ty += 1) for (let tx = 0; tx < targetWidth; tx += 1) {
      const virtualX = tx / Math.max(.0001, scale * xScale);
      const virtualY = ty / Math.max(.0001, scale * yScale);
      const sx = box.left + Math.min(sourceWidth - 1, Math.floor(virtualX));
      const sy = box.top + Math.min(sourceHeight - 1, Math.floor(virtualY));
      if (closed[sy * width + sx]) output[(offsetY + ty) * SIZE + offsetX + tx] = 1;
    }
    return output;
  }

  function distanceTransform(mask) {
    const inf = 255;
    const distance = new Uint16Array(mask.length);
    for (let i = 0; i < mask.length; i += 1) distance[i] = mask[i] ? 0 : inf;
    for (let y = 0; y < SIZE; y += 1) for (let x = 0; x < SIZE; x += 1) {
      const index = y * SIZE + x;
      let value = distance[index];
      if (x) value = Math.min(value, distance[index - 1] + 1);
      if (y) value = Math.min(value, distance[index - SIZE] + 1);
      if (x && y) value = Math.min(value, distance[index - SIZE - 1] + 2);
      if (x + 1 < SIZE && y) value = Math.min(value, distance[index - SIZE + 1] + 2);
      distance[index] = value;
    }
    for (let y = SIZE - 1; y >= 0; y -= 1) for (let x = SIZE - 1; x >= 0; x -= 1) {
      const index = y * SIZE + x;
      let value = distance[index];
      if (x + 1 < SIZE) value = Math.min(value, distance[index + 1] + 1);
      if (y + 1 < SIZE) value = Math.min(value, distance[index + SIZE] + 1);
      if (x + 1 < SIZE && y + 1 < SIZE) value = Math.min(value, distance[index + SIZE + 1] + 2);
      if (x && y + 1 < SIZE) value = Math.min(value, distance[index + SIZE - 1] + 2);
      distance[index] = value;
    }
    return distance;
  }

  function feature(mask) {
    const px = new Float32Array(SIZE);
    const py = new Float32Array(SIZE);
    let area = 0;
    for (let y = 0; y < SIZE; y += 1) for (let x = 0; x < SIZE; x += 1) {
      if (!mask[y * SIZE + x]) continue;
      px[x] += 1;
      py[y] += 1;
      area += 1;
    }
    let maxX = 1, maxY = 1;
    for (const value of px) if (value > maxX) maxX = value;
    for (const value of py) if (value > maxY) maxY = value;
    for (let i = 0; i < SIZE; i += 1) { px[i] /= maxX; py[i] /= maxY; }
    return { mask, dt: distanceTransform(mask), px, py, area };
  }

  function featureDistance(a, b) {
    let intersection = 0;
    let union = 0;
    let aDistance = 0;
    let bDistance = 0;
    for (let index = 0; index < a.mask.length; index += 1) {
      const av = a.mask[index];
      const bv = b.mask[index];
      if (av && bv) intersection += 1;
      if (av || bv) union += 1;
      if (av) aDistance += b.dt[index];
      if (bv) bDistance += a.dt[index];
    }
    let projection = 0;
    for (let i = 0; i < SIZE; i += 1) projection += Math.abs(a.px[i] - b.px[i]) + Math.abs(a.py[i] - b.py[i]);
    projection /= SIZE * 2;
    const iouPenalty = 1 - intersection / Math.max(1, union);
    const chamfer = (aDistance / Math.max(1, a.area) + bDistance / Math.max(1, b.area)) / 18;
    const areaPenalty = Math.abs(Math.log((a.area + 1) / (b.area + 1)));
    return iouPenalty * .52 + chamfer * .25 + projection * .15 + areaPenalty * .08;
  }

  let templateFeatures = null;
  function templates() {
    if (templateFeatures) return templateFeatures;
    templateFeatures = {};
    for (const letter of LETTERS) {
      const base = unpack(TEMPLATE_PACK[letter]);
      const variants = [];
      for (const xScale of [.82, .92, 1, 1.1, 1.22]) for (const yScale of [.9, 1, 1.1]) {
        variants.push(feature(normalizeGlyph(base, SIZE, SIZE, xScale, yScale, 0)));
      }
      templateFeatures[letter] = variants;
    }
    return templateFeatures;
  }

  function cropGlyph(binary, segment) {
    const width = segment.right - segment.left + 1;
    const mask = new Uint8Array(width * binary.height);
    for (let y = 0; y < binary.height; y += 1) {
      for (let x = 0; x < width; x += 1) mask[y * width + x] = binary.mask[y * binary.width + segment.left + x];
    }
    return { mask, width, height: binary.height };
  }

  function scoreGlyph(glyph) {
    const inputVariants = [0, 1, 2].map((radius) => feature(normalizeGlyph(glyph.mask, glyph.width, glyph.height, 1, 1, radius)));
    const scores = [];
    const library = templates();
    for (const letter of LETTERS) {
      let best = Infinity;
      for (const input of inputVariants) for (const template of library[letter]) {
        const score = featureDistance(input, template);
        if (score < best) best = score;
      }
      scores.push({ letter, score: best });
    }
    scores.sort((a, b) => a.score - b.score);
    return scores;
  }

  function lexiconCorrection(scoreRows, raw) {
    const rawCost = scoreRows.reduce((sum, row) => sum + row[0].score, 0);
    let best = null;
    for (const word of LEXICON) {
      if (word.length !== scoreRows.length) continue;
      let cost = 0;
      let changes = 0;
      for (let index = 0; index < word.length; index += 1) {
        const candidate = scoreRows[index].find((item) => item.letter === word[index]);
        cost += candidate?.score ?? 1.2;
        if (word[index] !== raw[index]) changes += 1;
      }
      const extra = cost - rawCost;
      const allowance = .055 + Math.min(.34, scoreRows.length * .024 + changes * .035);
      if (extra <= allowance && (!best || cost < best.cost)) best = { word, cost, extra, changes };
    }
    return best;
  }

  function renderTextCanvas(text, options = {}) {
    const value = String(text || '').toLowerCase().replace(/[^a-z]/g, '');
    const scale = Math.max(.5, Number(options.scale || 1));
    const gap = Math.max(2, Math.round(Number(options.gap ?? 14)));
    const padding = Math.max(0, Math.round(Number(options.padding ?? 12)));
    const cell = Math.max(1, Math.round(SIZE * scale));
    const canvas = makeCanvas(Math.max(1, padding * 2 + value.length * cell + Math.max(0, value.length - 1) * gap), padding * 2 + cell);
    const context = canvas.getContext('2d');
    context.clearRect(0, 0, canvas.width, canvas.height);
    if (options.background && options.background !== 'transparent') {
      context.fillStyle = String(options.background);
      context.fillRect(0, 0, canvas.width, canvas.height);
    }
    context.fillStyle = String(options.foreground || '#000');
    for (let index = 0; index < value.length; index += 1) {
      const mask = unpack(TEMPLATE_PACK[value[index]]);
      const originX = padding + index * (cell + gap);
      for (let y = 0; y < SIZE; y += 1) for (let x = 0; x < SIZE; x += 1) {
        if (!mask[y * SIZE + x]) continue;
        const left = originX + Math.floor(x * scale);
        const top = padding + Math.floor(y * scale);
        const right = originX + Math.ceil((x + 1) * scale);
        const bottom = padding + Math.ceil((y + 1) * scale);
        context.fillRect(left, top, Math.max(1, right - left), Math.max(1, bottom - top));
      }
    }
    return canvas;
  }

  function recognizeCanvas(canvas, options = {}) {
    const binary = binaryFromCanvas(canvas);
    const segments = verticalSegments(binary);
    if (segments.length < 1 || segments.length > 48) return null;
    if (options.expectedGlyphs && Math.abs(segments.length - options.expectedGlyphs) > 1) return null;
    const rows = segments.map((segment) => scoreGlyph(cropGlyph(binary, segment)));
    const raw = rows.map((row) => row[0].letter).join('');
    const correction = lexiconCorrection(rows, raw);
    const text = correction?.word || raw;
    const average = rows.reduce((sum, row) => sum + row[0].score, 0) / rows.length;
    const margin = rows.reduce((sum, row) => sum + ((row[1]?.score ?? row[0].score) - row[0].score), 0) / rows.length;
    const accepted = Boolean(correction) || (average <= .235 && margin >= .045);
    return {
      release: RELEASE,
      text,
      raw,
      accepted,
      corrected: Boolean(correction),
      correction,
      glyphs: segments.length,
      averageScore: average,
      averageMargin: margin,
      threshold: binary.threshold,
      lightForeground: binary.lightForeground,
      topCandidates: rows.map((row) => row.slice(0, 6))
    };
  }

  global.__RUNE_GLYPH_V16__ = Object.freeze({
    release: RELEASE,
    recognizeCanvas,
    renderTextCanvas,
    binaryFromCanvas,
    verticalSegments,
    lexicon: LEXICON
  });
  document.documentElement.dataset.runeGlyphV16 = RELEASE;
})(window);
