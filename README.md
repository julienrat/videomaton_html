# Videomaton (Web)

Application web de videomaton: aperçu caméra, enregistrement vidéo, raccourci clavier, compte à rebours, indicateur REC, bordure rouge, fond personnalisable, sélection de caméra, et arrêt automatique sur silence.

## Démo (GitHub Pages)
- URL: https://julienrat.github.io/videomaton_html/

## Prérequis
- Navigateur moderne (Chrome/Edge recommandés pour le choix de dossier)
- Caméra et micro disponibles
- Accès autorisé à la caméra et au micro dans le navigateur

## Lancement local
Depuis un terminal, lancez un petit serveur HTTP à la racine du projet:

```bash
python3 -m http.server 8080 --directory /home/julien2002/Developpement/videomaton_html
```

Puis ouvrez l’URL: `http://localhost:8080`.

Astuce: le choix de dossier d’enregistrement (File System Access API) fonctionne sur `http(s)` et `localhost` dans Chrome/Edge.

## Utilisation
- Appuyer sur « m »: affiche/masque le panneau de paramètres.
- Bouton « Démarrer »: lance l’enregistrement (après le compte à rebours s’il est activé).
- Bouton « Arrêter »: stoppe l’enregistrement.
- Indicateur REC et bordure rouge visibles pendant l’enregistrement.

## Favicons
- Vous pouvez ajouter des favicons à la page en insérant ces lignes dans `index.html` (dans `<head>`):

```html
<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
<meta name="theme-color" content="#0d1117">
```

- Générer les fichiers avec un générateur (ex. RealFaviconGenerator) et placer les fichiers à la racine du dépôt (ou adapter les chemins si besoin).

### Paramètres (panneau latéral)
- Caméra: sélectionnez l’entrée vidéo (si plusieurs disponibles).
- Phrase: texte affiché au-dessus de la vidéo (grand titre lorsque le menu est masqué).
- Raccourci clavier: cliquez dans le champ et appuyez sur la touche désirée pour démarrer/arrêter.
- Pause anti double-clic (ms): délai minimum entre deux toggles (clavier/boutons) pour éviter les doubles déclenchements.
- Compte à rebours (secondes): temps avant démarrage de l’enregistrement.
- Fond: 
  - Couleur de fond.
  - Image de fond via URL ou sélection de fichier (le fichier est converti en Data URL et mémorisé localement).
- Seuil de silence (0–1): niveau RMS en dessous duquel on considère qu’il y a silence.
  - Vu-mètre sous le slider + marqueur du seuil pour un réglage visuel.
  - Champ numérique synchronisé (0–1 / pas 0.01).
  - Calibrer au niveau actuel: fixe rapidement le seuil d’après le niveau mesuré en direct.
- Durée de silence avant arrêt (ms): temps consécutif sous le seuil pour arrêter automatiquement l’enregistrement.
- Dossier d’enregistrement: 
  - Choisir un dossier (Chrome/Edge). 
  - Si non disponible/non autorisé, le fichier est téléchargé (fallback).

Tous les paramètres sont mémorisés dans le navigateur (`localStorage`).

## Enregistrement
- Format: `webm` (codecs dépendants du support du navigateur; VP8/VP9 + Opus généralement).
- Nom de fichier: `videomaton_YYYY-MM-DD_HH-MM-SS.webm`.
- Destination:
  - Si un dossier est choisi (et autorisé): écriture directe dans le dossier.
  - Sinon: téléchargement via le navigateur.

## Raccourcis et comportements
- « m »: afficher/masquer le menu.
- Touche personnalisée: démarre/arrête (bloquée pendant le compte à rebours, anti-repeat, et respect du délai anti double-clic).

## Détection du silence
- Mesure du niveau RMS en temps réel (via Web Audio `AnalyserNode`).
- Arrêt automatique si le niveau reste sous le seuil pendant la durée configurée.
- Vu-mètre global sous la vidéo et vu-mètre compact dans les paramètres.

## Compatibilité
- Testé sur Chrome/Edge récents.
- Safari/Firefox: certaines fonctionnalités (choix de dossier, certains codecs) peuvent être limitées.

## Dépannage
- Pas d’image/son: vérifier les permissions caméra/micro dans le navigateur.
- Pas de choix de dossier: utiliser Chrome/Edge sur `http(s)` ou `localhost`.
- Pas d’audio dans l’aperçu: l’aperçu est muet (muted) par design; l’audio est enregistré normalement.
- Double démarrage/arrêt: ajuster la « Pause anti double-clic (ms) » et vérifier que la touche raccourci n’est pas répétée par le clavier.

## Développement
Fichiers principaux:
- `index.html`: structure de la page et panneau de paramètres.
- `styles.css`: styles, layout, bordure d’enregistrement, indicateur REC, vu-mètres.
- `app.js`: logique (caméra, enregistrement, raccourcis, audio, sauvegarde, paramètres persistants).

Serveur de dev suggéré:
```bash
python3 -m http.server 8080 --directory /chemin/vers/videomaton_html
```

## Licence
À définir par le propriétaire du dépôt.

