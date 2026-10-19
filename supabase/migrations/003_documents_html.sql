-- Documents au format page HTML (en plus des PDF).
-- À exécuter UNE FOIS dans Supabase > SQL Editor si le portail est déjà installé.
-- Sans risque pour les données existantes : elle autorise seulement un type de fichier de plus dans l'espace « documents ».
-- La page HTML est affichée dans un cadre isolé (sans script) ; les règles d'accès par client restent inchangées.

update storage.buckets
   set allowed_mime_types = array['application/pdf', 'text/html']
 where id = 'documents';
