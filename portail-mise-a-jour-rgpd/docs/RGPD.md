# Conformité RGPD du portail client : guide pratique

Ce document explique ce que le portail fait déjà pour respecter le RGPD, ce qu'il vous reste à faire de votre côté, et comment réagir aux demandes de vos clients. Ce n'est **pas un avis juridique** : en cas de doute, faites valider par un juriste ou votre fiduciaire.

## 1. Ce que le portail fait déjà

| Exigence | Comment le portail y répond |
|---|---|
| **Information des personnes** (article 13) | Page publique `/confidentialite` (identité du responsable, données, finalités, bases légales, destinataires, durées, droits, réclamation à l'APD). Lien dans le pied de page, sur la page de connexion et dans tous les emails. |
| **Preuve que l'information a été donnée** | À la première connexion (et à chaque nouvelle version de la politique), le client voit un écran « Avant de continuer » et coche « J'ai pris connaissance ». La date et la version sont enregistrées. |
| **Base légale** | Exécution du contrat de mission (et intérêt légitime pour la sécurité). Ce n'est pas un « consentement » : il n'y a donc pas de case de consentement à cocher pour utiliser le service. |
| **Cookies** | **Aucun bandeau n'est nécessaire** : le portail ne dépose aucun cookie publicitaire ni de mesure d'audience, seulement le stockage technique indispensable à la session de connexion, qui est exempté de consentement. Afficher un bandeau « accepter / refuser » sans rien à refuser serait trompeur. Voir la section 5 si cela change. |
| **Minimisation** | Seuls le nom, l'email et l'entreprise sont demandés. Polices hébergées sur le site : aucune requête vers un service externe. |
| **Sécurité** (article 32) | HTTPS, mots de passe chiffrés, cloisonnement des clients appliqué dans la base (64 vérifications automatiques), fichiers privés à liens temporaires, accès d'administration unique. |
| **Droit d'accès et de portabilité** | Fiche client, « Données et suppression », « Exporter les données (JSON) ». |
| **Droit à l'effacement** | Fiche client, « Supprimer ce client » (retaper le nom de l'entreprise) : efface fichiers, comptes de connexion, documents, photos et échanges. « Retirer l'accès » supprime une seule personne. |
| **Droit de rectification** | Voir la section 6 : à faire pour l'instant dans Supabase. |
| **Photos de personnes** | Case obligatoire à la création d'une galerie : vous confirmez l'accord des personnes identifiables. |

## 2. Ce qu'il vous reste à faire

- [ ] **Numéros BCE et TVA** : renseignez `bce` et `vat` dans `src/config.js` (objet `LEGAL`). Ils s'affichent alors sur la page. Ces mentions sont obligatoires sur un site de services en Belgique ; elles n'apparaissent pas non plus dans les mentions légales de gomandconsult.com au moment de la vérification : à compléter aussi.
- [ ] **Contrats de sous-traitance (DPA)** : acceptez ou signez le DPA de **Supabase**, **Netlify** et **Resend** (rubrique « Legal » ou « DPA » de leurs sites ou réglages) et conservez une copie.
- [ ] **Resend** : dans *Domains → votre domaine*, vérifiez que le suivi des ouvertures et des clics est **désactivé** (sinon l'email contient un pixel de suivi, contraire à ce que dit la politique). Si une région UE est proposée pour l'envoi, choisissez-la.
- [ ] **Durée de conservation** : la politique annonce **12 mois après la fin de la mission**. Changez `RETENTION_MONTHS` dans `src/config.js` si vous préférez une autre durée, et mettez un rappel dans votre agenda pour purger.
- [ ] **Site vitrine** : la politique de confidentialité de gomandconsult.com ne mentionne pas encore l'espace client. Ajoutez une phrase et un lien vers `https://espace.gomandconsult.com/confidentialite`.
- [ ] **Registre des traitements** : conservez le modèle de la section 3 (à tenir à jour).
- [ ] **Double authentification** (2FA) sur vos comptes d'administration : Supabase, Netlify, GitHub, Resend, Google Workspace. Un seul compte compromis donnerait accès à tous les clients.
- [ ] **Assurance** : vérifiez avec votre assureur que votre RC professionnelle couvre ce type d'outil (et une éventuelle cyber-assurance).
- [ ] **Sauvegardes** : plan gratuit de Supabase sans sauvegarde automatique, voir le README.

## 3. Registre des activités de traitement (modèle)

| | Espace client |
|---|---|
| **Responsable** | Gomand Consult SRL, Rue du Moulin 35, 1457 Walhain. Contact : hello@gomandconsult.com |
| **Finalité** | Partager les documents de mission avec le client, recueillir ses retours, valider des photos |
| **Personnes concernées** | Contacts des entreprises clientes ; personnes identifiables sur des photos |
| **Données** | Nom, email, entreprise, mot de passe (chiffré), documents, photos, commentaires, dates de consultation, données techniques de connexion |
| **Base légale** | Exécution du contrat (6.1.b) ; intérêt légitime (6.1.f) pour la sécurité ; obligation légale (6.1.c) pour la comptabilité |
| **Destinataires** | Supabase (Irlande, UE), Netlify (États-Unis), Resend (États-Unis) |
| **Transferts hors UE** | Netlify et Resend : clauses contractuelles types et/ou cadre UE–États-Unis, à vérifier dans leurs DPA |
| **Durée** | Mission + 12 mois ; comptabilité : sept ans dans l'outil de facturation |
| **Sécurité** | HTTPS, cloisonnement par client au niveau de la base, fichiers privés à liens temporaires, 2FA sur les comptes d'administration |

## 4. Procédures

**Un client demande l'accès à ses données ou une copie.** Vérifiez son identité (email connu, ou rappel téléphonique). Fiche client, « Exporter les données (JSON) ». Joignez les fichiers si besoin. Répondez **dans un délai d'un mois**.

**Un client demande la suppression de ses données.** Vérifiez son identité, puis fiche client, « Supprimer ce client ». C'est définitif. Les sauvegardes de Supabase (formule Pro) disparaissent selon leur rotation. Répondez au client pour confirmer. Gardez une trace de la demande et de la date de suppression (pas des données elles-mêmes).

**Une personne quitte l'entreprise cliente.** Fiche client, « Accès », « Retirer l'accès ». Ses commentaires sont supprimés avec son compte.

**Fin de mission.** Notez la date de fin ; supprimez le client 12 mois plus tard (ou plus tôt à sa demande).

**Violation de données** (accès non autorisé, perte, clé divulguée) :
1. Contenir : changez immédiatement les clés (Supabase, Resend, Netlify), fermez les comptes concernés.
2. Documenter : ce qui s'est passé, quand, quelles données.
3. Si la violation présente un risque pour les personnes : **notifier l'APD dans les 72 heures** (formulaire en ligne sur autoriteprotectiondonnees.be), et informer les personnes concernées si le risque est élevé.

## 5. Si vous ajoutez un jour un outil de suivi

Un outil de mesure d'audience, une vidéo intégrée, un widget de chat ou toute ressource d'un tiers qui dépose des cookies ou lit le navigateur **change la situation** : il faudra alors un bandeau de consentement qui bloque ces éléments tant que la personne n'a pas accepté, et mettre à jour la politique et la politique de sécurité (`netlify.toml`, en-tête `Content-Security-Policy`). Demandez-moi de le faire à ce moment-là.

## 6. Limites actuelles

- **Rectification** : il n'y a pas d'écran pour modifier le nom d'une entreprise ou l'email d'un contact. Pour l'instant : *Supabase → Table Editor → `clients` ou `profiles`*. Pour un changement d'**email de connexion**, modifiez aussi *Authentication → Users*, ou retirez l'accès et invitez à nouveau.
- **Purge automatique** : elle n'existe pas. La suppression se fait à la main, d'où le rappel dans l'agenda.
- **Journal d'accès** : le portail ne tient pas de journal de consultation, hormis la date de première ouverture d'un document ou d'une galerie.

## 7. Modifier la politique de confidentialité

Le texte est dans `src/pages/Privacy.jsx`, les réglages dans `src/config.js`. Après un changement important, modifiez `PRIVACY_VERSION` et `PRIVACY_DATE` : chaque client verra à nouveau l'écran « Avant de continuer » à sa prochaine connexion.
