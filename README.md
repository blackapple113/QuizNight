# 🎲 Quizz

Ein kleines browserbasiertes Quizspiel für **Spieleabende, Partys und gemütliche Runden mit Freunden**.

Keine Installation, kein Account, kein Server: Ordner herunterladen, `index.html` doppelklicken und losspielen.  
Die Fragen werden zufällig aus verschiedenen Kategorien und Schwierigkeitsstufen zusammengestellt – dadurch sieht nicht jede Runde gleich aus.

> **Einfach ausprobieren:** Eine Online-Demo kann z. B. über [raw.githack](https://raw.githack.com/blackapple113/quizz/main/index.html) bereitgestellt werden.  
> Den fertigen Demo-Link kannst du hier später direkt verlinken.

---

## 🚀 In 30 Sekunden losspielen

1. Repository als ZIP herunterladen.
2. ZIP entpacken.
3. `index.html` doppelklicken.
4. Teamnamen eintragen.
5. Auf **Spiel starten** klicken.
6. Wissen, Halbwissen und gefährliches Selbstvertrauen gegeneinander antreten lassen.

**Das war's.**  
Es wird kein lokaler Webserver benötigt und es müssen keine Abhängigkeiten installiert werden.

Das Spiel ist in erster Linie dafür gedacht, von einer Person am Laptop, Fernseher oder Beamer durch einen **Spieleabend** geführt zu werden.

---

## 🎮 Wie wird gespielt?

Zu Beginn werden Teams eingetragen. Anschließend erzeugt das Spiel aus dem gewählten Fragenpool ein zufälliges Board.

Je nach Einstellung kann gespielt werden mit:

- **Offenen Fragen** – die eigentliche Quizvariante. Auf Wunsch kann später MC-Hilfe eingeblendet werden.
- **Multiple Choice** – alle Antwortmöglichkeiten sind direkt sichtbar.
- **MC-Hilfe mit reduzierten Punkten** – ideal, wenn ein Team bei einer offenen Frage nicht weiterkommt.
- **Challenge** – jedes Team kann pro Runde vor der Fragenwahl einmal alles auf eine Karte setzen. Multiplikator und negative Punktestände sind einstellbar.
- **Antwort-Timer** – optional mit frei wählbarer Zeit.
- **Zufälligen Kategorien und Fragen** – mehrere Runden aus demselben Pool bleiben abwechslungsreich.
- **Tie-Breakern** – bei Gleichstand entscheidet eine Schätzfrage.

Punktestände können während des Spiels manuell korrigiert werden. Der aktuelle Spielstand wird außerdem im Browser gespeichert, sodass eine versehentlich geschlossene Seite nicht automatisch die ganze Runde beendet.

---

## 🧩 Fragenpools

Das Spiel kann unterschiedliche Fragenpools verwenden. Dadurch kann dieselbe Anwendung für verschiedene Runden genutzt werden, zum Beispiel:

- 🌍 **Standard** – klassisches Allgemeinwissen
- 🤓 **Nerd Quiz** – Computer, Gaming, Science-Fiction, Technik und Nerdkultur
- 🍺 eigene Themenrunden
- 🎄 saisonale Quizrunden
- 🧑‍💼 Firmen-, Vereins- oder Freundeskreis-Quiz

Der gewünschte Pool kann in den **Einstellungen** gewählt werden.

---

## 🎨 Themes

Fragenpool und Aussehen sind voneinander getrennt. Dadurch kann ein Pool mit unterschiedlichen Themes gespielt werden.

Bereits vorgesehene Themes sind beispielsweise:

- Standard
- Oktoberfest
- Weihnachten
- Karneval
- Nerd

Das Theme kann vor einer Runde über die Einstellungen gewählt werden.

---

# 🛠️ Eine fertige Version für andere vorbereiten

Nicht jeder möchte vor einem Spieleabend erst Einstellungen durchgehen – und nicht jeder Mensch, dem man das Spiel schickt, möchte sich mit HTML oder JavaScript beschäftigen.

Genau dafür gibt es `scripts/config.js`.

Dort können die **Voreinstellungen für eine frisch heruntergeladene Version** festgelegt werden. So kannst du beispielsweise eine fertige Variante vorbereiten:

> „Hier ist das Nerd-Quiz für Samstag. Einfach den Ordner entpacken, `index.html` öffnen und auf *Spiel starten* klicken.“

Das ist besonders praktisch, wenn du das Spiel an eine technisch weniger affine Person weitergeben möchtest.

Typische Defaults sind:

| Einstellung | Beispiel |
|---|---|
| Fragenpool | `standard` oder `nerd_quizz` |
| Theme | `standard`, `nerd`, `oktoberfest`, … |
| Spielmodus | offene Fragen oder Multiple Choice |
| Kategorien pro Runde | z. B. 5 |
| Fragen je Kategorie | z. B. 5 |
| Punkte bei MC-Hilfe | z. B. 50 % |
| Challenge | an/aus, Multiplikator und negative Punktestände |
| Antwort-Timer | an / aus |
| Antwortzeit | z. B. 30 Sekunden |

Öffne dafür einfach:

```text
scripts/config.js
```

und passe dort die **bereits vorhandenen Default-Werte** an.

Die normalen Einstellungen im Spiel bleiben weiterhin verfügbar. Die Defaults bestimmen lediglich, mit welchen Einstellungen eine neue bzw. noch nicht konfigurierte Version startet.

> 💡 **Praktischer Anwendungsfall:**  
> Du möchtest einer anderen Person ein fertiges Oktoberfest-Quiz schicken. Setze Fragenpool, Theme, Spielmodus und Board-Größe vorher passend in `config.js`, packe den gesamten Ordner als ZIP und schicke ihn weiter. Die Person muss anschließend nur noch `index.html` öffnen.

---

# ✍️ Eigene Fragen hinzufügen

Eigene Fragen werden in den Dateien unter `pools/` gepflegt.

Am einfachsten ist es, eine vorhandene Frage als Vorlage zu kopieren:

```js
{
  "id": "my-question-001",
  "category": "Essen & Trinken",
  "points": 200,
  "question": "Welche Hülsenfrucht ist die Hauptzutat von klassischem Hummus?",
  "answer": "Kichererbse",
  "choices": [
    "Linse",
    "Kichererbse",
    "Kidneybohne",
    "Erbse"
  ],
  "correctChoiceIndex": 1
}
```

### Wichtig

`correctChoiceIndex` beginnt bei **0**:

```text
0 = erste Antwort
1 = zweite Antwort
2 = dritte Antwort
3 = vierte Antwort
```

Im Beispiel ist `"Kichererbse"` die zweite Antwort, deshalb:

```js
"correctChoiceIndex": 1
```

### Gute Fragen für dieses Spiel

Das Spiel ist darauf ausgelegt, dass Fragen **zuerst offen beantwortbar** sind.

Gut:

> Welcher Planet besitzt den Großen Roten Fleck?

Antwort:

> Jupiter

Weniger geeignet:

> Welche dieser Aussagen über Jupiter ist korrekt?

Die Multiple-Choice-Antworten sollen eine **optionale Hilfe** sein und nicht notwendig, um überhaupt zu verstehen, was gefragt ist.

---

## 📊 Schwierigkeitsstufen

Die Punktzahl entspricht gleichzeitig der vorgesehenen Schwierigkeit:

| Punkte | Idee |
|---:|---|
| 100 | sollte vielen bekannt sein |
| 200 | normales Allgemeinwissen |
| 300 | etwas spezieller |
| 400 | gutes Fach- oder Detailwissen |
| 500 | schwierige Spezialfrage |

Eine Kategorie sollte für jede im Spiel verwendete Punktestufe Fragen enthalten.

Für ein klassisches Board mit:

```text
100 · 200 · 300 · 400 · 500
```

braucht eine Kategorie also mindestens eine Frage je Punktestufe.

Für zufällige und abwechslungsreiche Runden sind natürlich mehrere Fragen je Stufe deutlich besser.

---

# 🗂️ Einen eigenen Fragenpool erstellen

Für eine komplett eigene Quizrunde empfiehlt es sich, **nicht den Standard-Pool umzuschreiben**, sondern einen neuen Pool anzulegen.

1. Eine vorhandene Pool-Datei in `pools/` als Vorlage kopieren.
2. Einen eindeutigen Namen und eine eindeutige `poolId` vergeben.
3. Eigene Kategorien und Fragen eintragen.
4. Tie-Breaker ergänzen.
5. Den neuen Pool in `pools/index.js` registrieren.

So bleiben vorhandene Pools erhalten und Updates lassen sich leichter übernehmen.

Eine Pool-Datei enthält grundsätzlich:

```js
{
  "name": "Mein Quiz",
  "poolId": "mein_quiz",

  "config": {
    "points": [100, 200, 300, 400, 500],
    "defaultMcHelpMultiplier": 0.5
  },

  "questions": [
    // normale Fragen
  ],

  "tiebreakers": [
    // Schätzfragen
  ]
}
```

---

# 🎯 Tie-Breaker / Schätzfragen

Bei Punktegleichstand können Tie-Breaker verwendet werden.

Beispiel:

```js
{
  "id": "tb1",
  "question": "Wie viele Kilometer beträgt die durchschnittliche Entfernung zwischen Erde und Mond ungefähr?",
  "answer": "Ca. 384.400 km",
  "numericAnswer": 384400,
  "choices": [
    "Ca. 184.400 km",
    "Ca. 284.400 km",
    "Ca. 384.400 km",
    "Ca. 584.400 km"
  ]
}
```

Für Tie-Breaker sollte immer ein eindeutiger numerischer Wert in

```js
"numericAnswer"
```

stehen.

Außerdem sollte die **Einheit bereits in der Frage genannt werden**, damit klar ist, was die Teams eingeben sollen:

✅ „Wie viele **Kilometer** …?“  
✅ „Wie viele **Meter** …?“  
✅ „Wie viele **Jahre** …?“

Dadurch kann das Spiel die Schätzungen zuverlässig miteinander vergleichen.

---

# 🎨 Ein eigenes Theme bauen

Themes liegen unter:

```text
themes/
```

Zum Beispiel:

```text
themes/
├── standard/
├── oktoberfest/
├── christmas/
├── carnival/
└── nerd/
```

Ein neues Theme kann sich an einer vorhandenen `theme.css` orientieren.

Die Styles werden über das Theme-Attribut des `<body>` eingeschränkt:

```css
body[data-theme="mein-theme"] {
  --bg: #101820;
  --accent: #5eead4;
}
```

Anschließend muss das Stylesheet in `index.html` eingebunden und das Theme zur Theme-Auswahl hinzugefügt werden.

---

# 📁 Projektstruktur

Die wichtigsten Dateien auf einen Blick:

```text
.
├── index.html
│
├── scripts/
│   ├── app.js
│   └── config.js
│
├── pools/
│   ├── index.js
│   └── ...
│
├── styles/
│   └── core.css
│
└── themes/
    ├── standard/
    ├── oktoberfest/
    ├── christmas/
    ├── carnival/
    └── nerd/
```

### `index.html`

Startpunkt des Spiels. Kann direkt per Doppelklick geöffnet werden.

### `scripts/app.js`

Enthält die eigentliche Spiellogik.

### `scripts/config.js`

Enthält die Default-Einstellungen einer frisch gestarteten Version.

### `pools/`

Enthält die Fragenpools und deren Registrierung.

### `styles/core.css`

Gemeinsames Layout und grundlegendes Design aller Themes.

### `themes/`

Enthält die optischen Varianten des Spiels.

---

# 🌐 Online ausprobieren

Da das Spiel vollständig im Browser läuft, kann es auch statisch gehostet werden.

Für eine unkomplizierte Demo eines öffentlichen GitHub-Repositories kann beispielsweise **raw.githack** verwendet werden.

Das Schema sieht ungefähr so aus:

```text
https://raw.githack.com/<GitHub-User>/<Repository>/<Branch>/index.html
```

Beispiel:

```text
https://raw.githack.com/example/quizz/main/index.html
```

> Sobald der endgültige Repository-Link feststeht, lohnt es sich, ganz oben in dieser README einen großen **„🎮 Jetzt ausprobieren“**-Link auf die Demo zu setzen.

---

# 💡 Ideen für eigene Runden

Das Grundspiel lässt sich ziemlich leicht zweckentfremden:

- 🍻 Kneipenquiz
- 🎄 Weihnachtsfeier
- 🎂 Geburtstag
- 🤓 Nerd-Abend
- 🏢 Firmenfeier
- 🎓 Uni- oder Schulrunde
- ⚽ Fußballabend
- 🎬 Filmquiz
- 🎵 Musikquiz
- 👨‍👩‍👧 Familienabend

Eigener Fragenpool + passendes Theme + vorbereitete Defaults – und daraus wird mit wenig Aufwand eine komplett eigene Quizrunde.

---

## ❤️ Viel Spaß!

Das wichtigste Feature ist nicht der perfekte Fragenpool und auch nicht das schönste Theme:

**Leute zusammentrommeln, Teams eintragen und einfach eine Runde starten.**

Wenn danach über eine Antwort diskutiert wird, jemand bei einer 100-Punkte-Frage komplett versagt und anschließend die 500er-Frage aus dem Nichts weiß, funktioniert das Spiel genau wie gedacht. 😄
