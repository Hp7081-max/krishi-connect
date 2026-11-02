/* Krishi Connect — voice-parser.js
   Turns a spoken sentence into { crop, qty, price, grade }.
   Works offline in the browser: no server, no AI quota.
   Understands Hindi (Devanagari), Hinglish (Roman) and English, e.g.
     "20 क्विंटल गेहूं 2400 रुपये क्विंटल"
     "बीस क्विंटल गेहूं भाव दो हज़ार चार सौ"
     "mere paas 50 quintal aloo hai rate 1200 rupaye"
     "ढाई सौ किलो टमाटर 25 रुपये किलो"
   Load this BEFORE voice-listing.js. */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.KrishiVoiceParser = api;
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this), function () {
  "use strict";

  /* ---------- text clean-up ---------- */
  function norm(s) {
    s = String(s == null ? "" : s);
    try { s = s.normalize("NFC"); } catch (e) { /* old browser */ }
    return s.toLowerCase()
      .replace(/[\u200b-\u200d\ufeff]/g, "")
      .replace(/\u0901/g, "\u0902")                              // ँ -> ं
      .replace(/\u093c/g, "")                                    // nukta (ज़ -> ज)
      .replace(/[\u0966-\u096f]/g, function (d) { return String(d.charCodeAt(0) - 0x0966); })   // Devanagari digits
      .replace(/₹/g, " ₹ ")
      .replace(/([0-9])([^0-9\s.,])/g, "$1 $2")
      .replace(/([^0-9\s.,])([0-9])/g, "$1 $2")
      .replace(/[।|!?;:"“”'‘’()\[\]{}\/\-–—]/g, " ")
      .replace(/(\d),(?=\d{3}(\D|$))/g, "$1")                    // 2,400 -> 2400
      .replace(/,/g, " ")
      .replace(/\s+/g, " ").trim();
  }

  function set(words) {
    var m = Object.create(null);
    words.split(" ").forEach(function (w) { if (w) m[norm(w)] = true; });
    return m;
  }
  function has(map, tok) { return tok !== undefined && (tok in map); }

  /* ---------- number words ---------- */
  var SMALL = Object.create(null), MULT = Object.create(null), FRAC = Object.create(null), MOD = Object.create(null);
  function addTo(map, value, words) {
    words.split(" ").forEach(function (w) { if (w) map[norm(w)] = value; });
  }

  [
    [0, "शून्य zero"], [1, "एक ek one"], [2, "दो do two"], [3, "तीन teen tin three"], [4, "चार char chaar four"],
    [5, "पांच paanch panch five"], [6, "छह छः छे chhe chhah six"], [7, "सात saat sat seven"], [8, "आठ aath ath eight"],
    [9, "नौ nau nine"], [10, "दस das dus ten"], [11, "ग्यारह gyarah eleven"], [12, "बारह barah baarah twelve"],
    [13, "तेरह terah thirteen"], [14, "चौदह chaudah fourteen"], [15, "पंद्रह पन्द्रह pandrah fifteen"],
    [16, "सोलह solah sixteen"], [17, "सत्रह satrah seventeen"], [18, "अठारह atharah eighteen"], [19, "उन्नीस unnis nineteen"],
    [20, "बीस bees twenty"], [21, "इक्कीस ikkis"], [22, "बाईस baais"], [23, "तेईस teis"], [24, "चौबीस chaubis"],
    [25, "पच्चीस pachchis pachees pachis"], [26, "छब्बीस chhabbis"], [27, "सत्ताईस sattais"], [28, "अट्ठाईस अठाईस atthais"],
    [29, "उनतीस untis"], [30, "तीस tees thirty"], [31, "इकतीस"], [32, "बत्तीस battis"], [33, "तैंतीस"], [34, "चौंतीस"],
    [35, "पैंतीस paintis"], [36, "छत्तीस"], [37, "सैंतीस"], [38, "अड़तीस"], [39, "उनतालीस"], [40, "चालीस chalis forty"],
    [41, "इकतालीस"], [42, "बयालीस"], [43, "तैंतालीस"], [44, "चौवालीस चवालीस"], [45, "पैंतालीस"], [46, "छियालीस"],
    [47, "सैंतालीस"], [48, "अड़तालीस"], [49, "उनचास"], [50, "पचास pachas fifty"], [51, "इक्यावन"], [52, "बावन"],
    [53, "तिरपन तिरेपन"], [54, "चौवन"], [55, "पचपन"], [56, "छप्पन"], [57, "सत्तावन"], [58, "अट्ठावन अठावन"],
    [59, "उनसठ"], [60, "साठ saath sixty"], [61, "इकसठ"], [62, "बासठ"], [63, "तिरसठ तिरेसठ"], [64, "चौंसठ"],
    [65, "पैंसठ"], [66, "छियासठ"], [67, "सड़सठ"], [68, "अड़सठ"], [69, "उनहत्तर उनहतर"], [70, "सत्तर sattar seventy"],
    [71, "इकहत्तर"], [72, "बहत्तर"], [73, "तिहत्तर"], [74, "चौहत्तर"], [75, "पचहत्तर pachattar"], [76, "छिहत्तर"],
    [77, "सतहत्तर"], [78, "अठहत्तर"], [79, "उन्यासी"], [80, "अस्सी assi eighty"], [81, "इक्यासी"], [82, "बयासी"],
    [83, "तिरासी"], [84, "चौरासी"], [85, "पचासी"], [86, "छियासी"], [87, "सत्तासी"], [88, "अट्ठासी"], [89, "नवासी"],
    [90, "नब्बे nabbe ninety"], [91, "इक्यानवे"], [92, "बानवे बानबे"], [93, "तिरानवे"], [94, "चौरानवे"], [95, "पंचानवे"],
    [96, "छियानवे"], [97, "सत्तानवे"], [98, "अट्ठानवे अठानवे"], [99, "निन्यानवे"]
  ].forEach(function (r) { addTo(SMALL, r[0], r[1]); });

  addTo(MULT, 100, "सौ sau hundred");
  addTo(MULT, 1000, "हजार hazar hazaar hajar thousand");
  addTo(MULT, 100000, "लाख lakh lakhs lac");
  addTo(FRAC, 2.5, "ढाई dhai dhaai adhai");
  addTo(FRAC, 1.5, "डेढ dedh");
  addTo(MOD, "sava", "सवा sava sawa");
  addTo(MOD, "sadhe", "साढे sadhe saadhe sade");
  addTo(MOD, "paune", "पौने paune pone");

  function kind(tok) {
    if (/^\d+(\.\d+)?$/.test(tok)) return { t: "digit", v: parseFloat(tok) };
    if (tok in SMALL) return { t: "small", v: SMALL[tok] };
    if (tok in MULT) return { t: "mult", v: MULT[tok] };
    if (tok in FRAC) return { t: "frac", v: FRAC[tok] };
    if (tok in MOD) return { t: "mod", v: MOD[tok] };
    return null;
  }

  /* find every number in the sentence -> [{start,end,value,weak,digit}] */
  function findNumbers(tokens) {
    var out = [], i = 0;
    while (i < tokens.length) {
      var k = kind(tokens[i]);
      if (!k || (k.t === "mod" && !(i + 1 < tokens.length && kind(tokens[i + 1])))) { i++; continue; }
      var start = i, total = 0, cur = 0, mod = null, last = null, words = 0, digits = 0;
      while (i < tokens.length) {
        k = kind(tokens[i]);
        if (!k) break;
        if (last === "digit" && k.t !== "mult") break;                          // "20 2400" = two numbers
        if ((last === "small" || last === "frac") && k.t === "digit") break;
        if (k.t === "mod" && last) break;
        if (k.t === "digit" || k.t === "small" || k.t === "frac") {
          var v = k.v;
          if (mod) { v = mod === "sava" ? v + 0.25 : (mod === "sadhe" ? v + 0.5 : v - 0.25); mod = null; }
          if (k.t === "frac") cur = v;
          else if (cur > 0 && cur % 100 === 0 && v < 100) cur += v;               // चार सौ पचास
          else if (cur >= 20 && cur < 100 && cur % 10 === 0 && v < 10 && k.t === "small") cur += v;   // twenty four
          else cur = v;
          if (k.t === "digit") digits++; else words++;
        } else if (k.t === "mult") {
          if (mod) { cur = mod === "sava" ? 1.25 : (mod === "sadhe" ? 1.5 : 0.75); mod = null; }
          if (k.v >= 1000) { total += (cur || 1) * k.v; cur = 0; }
          else { cur = (cur || 1) * k.v; }
          words++;
        } else {
          mod = k.v;
        }
        last = k.t; i++;
      }
      var value = total + cur;
      if (value > 0) {
        out.push({ start: start, end: i - 1, value: value, digit: digits > 0,
                   weak: digits === 0 && words === 1 && value < 10 && (tokens[start] in SMALL) });
      }
    }
    return out;
  }

  /* ---------- units, price words ---------- */
  var QTY_UNIT = Object.create(null);
  function addUnit(name, f, words) {
    words.split(" ").forEach(function (w) { if (w) QTY_UNIT[norm(w)] = { name: name, f: f }; });
  }
  addUnit("quintal", 1, "quintal quintals qtl kuintal kwintal क्विंटल क्विंटल्स क्विन्टल क्विटल कुंतल कुन्तल कुंटल");
  addUnit("kg", 0.01, "kilo kilos kg kgs kilogram kilograms किलो किलोग्राम किग्रा केजी");
  addUnit("ton", 10, "ton tons tonne tonnes टन");

  var RUPEE = set("रुपये रुपए रुपया रूपये रूपए रूपया rupaye rupaya rupay rupees rupee rs inr ₹ रू रु");
  var PRICE_BEFORE = set("भाव भाओ bhav bhaav rate रेट daam दाम price प्राइस कीमत keemat qeemat मूल्य mulya मोल mol at");
  var PRICE_AFTER = set("भाव bhav rate रेट daam दाम per प्रति prati");
  var PERW = set("प्रति prati per");
  var FILLER = set("है hai ha का ka की ki के ke at से se");
  var SKIP_UNIT = set("रुपये रुपए रुपया रूपये रूपए रूपया rupaye rupaya rupay rupees rupee rs ₹ प्रति prati per ki की ka का ke के har हर each ek एक one");

  function classify(tokens, nums) {
    nums.forEach(function (n) {
      var nx = tokens[n.end + 1], pv = tokens[n.start - 1], pv2 = tokens[n.start - 2];
      n.role = ""; n.unit = null;
      if (has(RUPEE, nx) || has(RUPEE, pv) || has(PRICE_BEFORE, pv) ||
          (has(PRICE_BEFORE, pv2) && has(FILLER, pv)) || has(PRICE_AFTER, nx)) {
        n.role = "price";
      } else if (has(QTY_UNIT, pv) && has(PERW, pv2)) {                         // "प्रति क्विंटल 2400"
        n.role = "price"; n.unit = pv;
      } else if (has(QTY_UNIT, nx)) {
        n.role = "qty"; n.unit = nx;
      }
      if (n.role === "price" && !n.unit) {                                      // price per what?
        for (var j = n.end + 1; j <= n.end + 4 && j < tokens.length; j++) {
          var tk = tokens[j];
          if (kind(tk) && !has(SKIP_UNIT, tk)) break;
          if (has(QTY_UNIT, tk)) { n.unit = tk; break; }
        }
      }
    });
  }

  /* ---------- crops ---------- */
  var CROPS = [
    ["wheat", "wheat|gehu|gehun|gehoon|गेहूं|गेहू|गेंहू|kanak|कनक"],
    ["rice", "rice|chawal|chaawal|चावल|dhan|धान|paddy|basmati|बासमती"],
    ["maize", "maize|corn|makka|makkai|मक्का|मक्की|मकई|bhutta|भुट्टा"],
    ["potato", "potato|aloo|aalu|आलू"],
    ["onion", "onion|pyaz|pyaaj|pyaj|प्याज"],
    ["tomato", "tomato|tamatar|टमाटर"],
    ["mustard", "mustard|sarson|sarso|सरसों|सरसो|rai|राई|toria|तोरिया"],
    ["soybean", "soybean|soyabean|soya|सोयाबीन|सोया"],
    ["chickpea", "chana|chane|चना|चने|chickpea|bengal gram"],
    ["pigeonpea", "arhar|tur|toor|tuar|अरहर|तुअर|तूर|तुवर|pigeon pea|red gram"],
    ["moong", "moong|mung|मूंग|green gram"],
    ["urad", "urad|उड़द|black gram|maash|माश"],
    ["masoor", "masoor|मसूर|lentil"],
    ["cotton", "cotton|kapas|कपास|रुई"],
    ["sugarcane", "sugarcane|ganna|गन्ना|ईख"],
    ["bajra", "bajra|बाजरा|pearl millet|bajri"],
    ["jowar", "jowar|ज्वार|sorghum|jwar"],
    ["barley", "barley|jau|जौ"],
    ["groundnut", "groundnut|peanut|moongfali|mungfali|मूंगफली"],
    ["garlic", "garlic|lahsun|lehsun|लहसुन"],
    ["ginger", "ginger|adrak|अदरक"],
    ["chilli", "chilli|chili|mirch|mirchi|मिर्च|मिर्ची"],
    ["turmeric", "turmeric|haldi|हल्दी"],
    ["cauliflower", "cauliflower|phoolgobhi|phool gobhi|फूलगोभी|फूल गोभी|gobhi|गोभी"],
    ["cabbage", "cabbage|pattagobhi|patta gobhi|पत्तागोभी|पत्ता गोभी|bandgobhi|band gobhi|बंदगोभी"],
    ["brinjal", "brinjal|baingan|बैंगन|eggplant"],
    ["okra", "okra|bhindi|भिंडी|ladyfinger|lady finger"],
    ["peas", "peas|matar|मटर"],
    ["banana", "banana|kela|केला"],
    ["mango", "mango|aam|आम"],
    ["apple", "apple|seb|सेब"],
    ["sunflower", "sunflower|surajmukhi|सूरजमुखी"],
    ["sesame", "sesame|til|तिल"],
    ["ragi", "ragi|रागी|mandua|मंडुआ|finger millet"],
    ["coriander", "coriander|dhaniya|धनिया"],
    ["cumin", "cumin|jeera|zeera|जीरा"],
    ["linseed", "linseed|alsi|अलसी|flaxseed"],
    ["lemon", "lemon|nimbu|नींबू|नीबू"],
    ["carrot", "carrot|gajar|गाजर"],
    ["radish", "radish|mooli|मूली"],
    ["spinach", "spinach|palak|पालक"],
    ["cucumber", "cucumber|kheera|khira|खीरा|ककड़ी|kakdi"],
    ["pumpkin", "pumpkin|kaddu|कद्दू"],
    ["bottlegourd", "lauki|लौकी|bottle gourd|ghiya|घीया"],
    ["bittergourd", "karela|करेला|bitter gourd"],
    ["guava", "guava|amrud|अमरूद"],
    ["orange", "orange|santra|संतरा|narangi"],
    ["papaya", "papaya|papita|पपीता"],
    ["pomegranate", "pomegranate|anar|अनार"],
    ["grapes", "grapes|angur|अंगूर"],
    ["watermelon", "watermelon|tarbooz|तरबूज"],
    ["muskmelon", "kharbuja|खरबूजा|muskmelon"],
    ["sweetpotato", "sweet potato|shakarkand|शकरकंद"],
    ["beans", "beans|sem|सेम|french beans|farasbi"],
    ["jute", "jute|patsan|जूट"]
  ];

  var INDEX = [];
  CROPS.forEach(function (c) {
    c[1].split("|").forEach(function (s) {
      s = norm(s);
      if (s) INDEX.push({ key: c[0], syn: s, deva: /[\u0900-\u097f]/.test(s), latin: /^[a-z ]+$/.test(s) });
    });
  });

  function lev(a, b) {
    var m = a.length, n = b.length, d = [], i, j;
    for (i = 0; i <= m; i++) { d[i] = [i]; }
    for (j = 1; j <= n; j++) { d[0][j] = j; }
    for (i = 1; i <= m; i++) {
      for (j = 1; j <= n; j++) {
        d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      }
    }
    return d[m][n];
  }

  /* -> {key, syn} or null. Longest / most exact match wins. */
  function detectCrop(text) {
    var t = norm(text), padded = " " + t + " ", toks = t ? t.split(" ") : [], best = null;
    INDEX.forEach(function (e) {
      var len = -1, i;
      if (padded.indexOf(" " + e.syn + " ") >= 0) {
        len = e.syn.length * 2 + 2;
      } else if (e.deva && e.syn.length >= 3) {
        for (i = 0; i < toks.length; i++) {
          if (toks[i].indexOf(e.syn) === 0 && toks[i].length - e.syn.length <= 2) { len = e.syn.length * 2; break; }
        }
      } else if (e.latin && e.syn.length >= 5) {
        for (i = 0; i < toks.length; i++) {
          if (toks[i].length >= 5 && Math.abs(toks[i].length - e.syn.length) <= 1 && lev(toks[i], e.syn) <= 1) { len = e.syn.length * 2 - 1; break; }
        }
      }
      if (len > 0 && (!best || len > best.len)) best = { key: e.key, syn: e.syn, len: len };
    });
    return best ? { key: best.key, syn: best.syn } : null;
  }

  /* ---------- grade ---------- */
  function detectGrade(t) {
    var g = {
      "a": "A", "b": "B", "c": "C", "ए": "A", "बी": "B", "सी": "C"
    };
    var m = /(?:^| )(?:grade|ग्रेड|gred|quality|क्वालिटी) (a|b|c|ए|बी|सी)(?: |$)/.exec(t) ||
            /(?:^| )(a|b|c|ए|बी|सी) (?:grade|ग्रेड|gred)(?: |$)/.exec(t);
    return m ? g[m[1]] : null;
  }

  /* ---------- main ---------- */
  function round(x) { return Math.round(x * 100) / 100; }

  function parse(text) {
    var t = norm(text), tokens = t ? t.split(" ") : [];
    var nums = findNumbers(tokens);
    classify(tokens, nums);

    var qty = null, price = null, unknown = [];
    nums.forEach(function (n) {
      if (n.role === "qty" && !qty) qty = n;
      else if (n.role === "price" && !price) price = n;
      else if (!n.role) unknown.push(n);
    });
    unknown = unknown.filter(function (n) { return !n.weak && (n.digit || n.value >= 100); });

    /* a number with no unit/keyword: make a careful guess and mark it */
    if (!qty && price && unknown.length) { qty = unknown.shift(); qty.guess = true; }
    else if (qty && !price && unknown.length) { price = unknown.shift(); price.guess = true; }
    else if (!qty && !price && unknown.length >= 2) {
      unknown.sort(function (a, b) { return a.value - b.value; });
      qty = unknown[0]; price = unknown[unknown.length - 1];
      qty.guess = true; price.guess = true;
    }

    var out = { text: t, crop: detectCrop(t), qty: null, price: null, grade: detectGrade(t) };

    if (qty) {
      var qu = (qty.unit && QTY_UNIT[qty.unit]) || { name: "quintal", f: 1 };
      out.qty = { value: qty.value, unit: qu.name, qtl: round(qty.value * qu.f), guess: !!qty.guess };
    }
    if (price) {
      var pu = (price.unit && QTY_UNIT[price.unit]) || { name: "quintal", f: 1 };
      out.price = { value: price.value, unit: pu.name, perQtl: round(price.value / pu.f), guess: !!price.guess };
    }
    out.found = (out.crop ? 1 : 0) + (out.qty ? 1 : 0) + (out.price ? 1 : 0);
    return out;
  }

  return { parse: parse, detectCrop: detectCrop, norm: norm, lev: lev, CROP_KEYS: CROPS.map(function (c) { return c[0]; }) };
});
