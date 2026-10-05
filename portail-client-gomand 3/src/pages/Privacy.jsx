import { Link } from 'react-router-dom';
import { PublicShell } from '../components/Layout';
import { LEGAL, PRIVACY_DATE, PRIVACY_VERSION, RETENTION_MONTHS } from '../config';
import { fr } from '../lib/format';

const P = ({ children }) => <p>{typeof children === 'string' ? fr(children) : children}</p>;
const Li = ({ children }) => <li>{typeof children === 'string' ? fr(children) : children}</li>;
const mail = (a) => <a href={`mailto:${a}`}>{a}</a>;

export default function Privacy() {
  return (
    <PublicShell>
      <div className="container">
        <div className="page-head">
          <p className="eyebrow">Espace client</p>
          <h1>Politique de confidentialité</h1>
          <p className="lede">{fr(`Cette page explique quelles données personnelles l’espace client de Gomand Consult utilise, pourquoi, combien de temps, et comment exercer vos droits. Version du ${PRIVACY_DATE}.`)}</p>
        </div>
        <div className="clarity-line drawn" />

        <article className="prose" style={{ paddingBottom: 72 }}>
          <h2 style={{ marginTop: 0 }}>1. Qui est responsable de vos données ?</h2>
          <P>{`Le responsable du traitement est ${LEGAL.name}, ${LEGAL.address}.`}</P>
          <ul>
            <Li>{`Forme juridique : ${LEGAL.form}`}</Li>
            {LEGAL.bce && <Li>{`Numéro d’entreprise (BCE) : ${LEGAL.bce}`}</Li>}
            {LEGAL.vat && <Li>{`Numéro de TVA : ${LEGAL.vat}`}</Li>}
            <Li>{`Téléphone : ${LEGAL.phone}`}</Li>
            <li>{fr('Contact pour toute question sur vos données : ')}{mail(LEGAL.privacyEmail)}</li>
          </ul>

          <h2>2. Quelles données sont utilisées ?</h2>
          <ul>
            <Li>Votre compte : nom, adresse email, entreprise et mot de passe. Le mot de passe est enregistré sous une forme chiffrée illisible, y compris pour nous.</Li>
            <Li>Le contenu de votre espace : devis, factures (copies de consultation), livrables, comptes rendus et photos, ainsi que vos commentaires, questions, surlignages et décisions sur les photos.</Li>
            <Li>Des informations de suivi du service : date de première consultation d’un document ou d’une galerie, envoi d’une sélection de photos, date à laquelle vous avez pris connaissance de cette politique.</Li>
            <Li>Des données techniques (adresse IP, navigateur, dates de connexion), conservées dans les journaux de sécurité de nos prestataires d’hébergement.</Li>
          </ul>

          <h2>3. Pourquoi, et sur quelle base légale ?</h2>
          <div className="table-wrap"><table>
            <thead><tr><th>Finalité</th><th>Base légale (RGPD)</th></tr></thead>
            <tbody>
              <tr><td>{fr('Vous donner accès à vos documents et échanger avec vous')}</td><td>Exécution du contrat de mission (article 6.1.b)</td></tr>
              <tr><td>{fr('Vous prévenir par email : invitation, nouveau document, réponse à un message')}</td><td>Exécution du contrat de mission (article 6.1.b)</td></tr>
              <tr><td>Sécuriser les accès et prévenir les abus</td><td>Intérêt légitime (article 6.1.f)</td></tr>
              <tr><td>Respecter nos obligations légales (comptabilité, demandes des autorités)</td><td>Obligation légale (article 6.1.c)</td></tr>
            </tbody>
          </table></div>
          <P>Aucun usage publicitaire, aucune vente de données, aucun profilage et aucune décision automatisée. Les emails envoyés par l’espace client sont uniquement des messages de service : ils ne contiennent jamais le texte de vos échanges, seulement un lien pour vous connecter.</P>

          <h2>4. Qui reçoit vos données ?</h2>
          <P>Vos données ne sont partagées qu’avec les prestataires techniques nécessaires au fonctionnement de l’espace client, liés à nous par un contrat de sous-traitance :</P>
          <div className="table-wrap"><table>
            <thead><tr><th>Prestataire</th><th>Rôle</th><th>Localisation</th></tr></thead>
            <tbody>
              <tr><td>Supabase</td><td>Base de données, comptes et fichiers</td><td>Données hébergées en Irlande (Union européenne)</td></tr>
              <tr><td>Netlify</td><td>Hébergement de l’application et des fonctions serveur</td><td>Société américaine, réseau mondial de diffusion</td></tr>
              <tr><td>Resend</td><td>Envoi des emails de service</td><td>Société américaine</td></tr>
            </tbody>
          </table></div>
          <P>Lorsqu’un prestataire est établi hors de l’Union européenne, le transfert est encadré par des garanties reconnues : clauses contractuelles types de la Commission européenne et/ou cadre de protection des données UE–États-Unis. Vos données ne sont jamais vendues ni cédées à des tiers à des fins commerciales.</P>
          <P>Les personnes de votre entreprise qui disposent d’un accès à l’espace voient les mêmes documents et échanges que vous.</P>

          <h2>5. Combien de temps sont-elles conservées ?</h2>
          <P>{`Les comptes, documents, photos et échanges sont conservés pendant la durée de la mission, puis ${RETENTION_MONTHS} mois après sa fin, avant d’être supprimés. Vous pouvez demander une suppression plus rapide à tout moment.`}</P>
          <P>Les documents comptables originaux (devis acceptés, factures) sont conservés dans notre outil de facturation pendant la durée légale (sept ans en Belgique). L’espace client n’en contient qu’une copie de consultation. Les journaux techniques des hébergeurs sont conservés pour une durée limitée que chacun fixe.</P>

          <h2>6. Cookies et stockage dans votre navigateur</h2>
          <P>Cet espace n’utilise aucun cookie publicitaire, aucun outil de mesure d’audience et aucun service tiers de suivi. Il utilise uniquement un stockage technique indispensable à son fonctionnement, qui ne nécessite pas votre consentement :</P>
          <div className="table-wrap"><table>
            <thead><tr><th>Élément</th><th>Rôle</th><th>Durée</th></tr></thead>
            <tbody>
              <tr><td>Stockage local du navigateur, clé commençant par « sb- » et finissant par « -auth-token »</td><td>Garder votre session ouverte après la connexion</td><td>Jusqu’à votre déconnexion</td></tr>
            </tbody>
          </table></div>
          <P>Les polices de caractères sont hébergées par l’espace client lui-même : votre navigateur ne contacte aucun serveur de polices externe.</P>
          <p>{fr('Le site vitrine gomandconsult.com est distinct de cet espace et a sa propre politique : ')}<a href={LEGAL.siteCookiesUrl} target="_blank" rel="noopener noreferrer">politique de cookies du site</a>.</p>

          <h2>7. Vos droits</h2>
          <P>Vous pouvez à tout moment demander :</P>
          <ul>
            <Li>l’accès à vos données et une copie de celles-ci, y compris dans un format structuré et lisible (portabilité) ;</Li>
            <Li>la rectification des données inexactes ;</Li>
            <Li>l’effacement de vos données, de votre accès ou de l’espace entier ;</Li>
            <Li>la limitation du traitement, ou vous y opposer lorsqu’il repose sur notre intérêt légitime.</Li>
          </ul>
          <p>{fr('Pour exercer ces droits, écrivez à ')}{mail(LEGAL.privacyEmail)}{fr('. Nous répondons dans un délai d’un mois et pouvons vous demander de confirmer votre identité.')}</p>
          <p>{fr('Si vous estimez que vos droits ne sont pas respectés, vous pouvez introduire une réclamation auprès de l’Autorité de protection des données (APD), Rue de la Presse 35, 1000 Bruxelles, ')}{mail('contact@apd-gba.be')}{fr(', ')}<a href="https://www.autoriteprotectiondonnees.be" target="_blank" rel="noopener noreferrer">www.autoriteprotectiondonnees.be</a>.</p>

          <h2>8. Sécurité</h2>
          <ul>
            <Li>Connexion chiffrée (HTTPS) et mots de passe enregistrés sous forme chiffrée.</Li>
            <Li>Fichiers privés, accessibles uniquement par des liens temporaires.</Li>
            <Li>Chaque client ne voit que son propre espace : ce cloisonnement est appliqué au niveau de la base de données.</Li>
            <Li>L’accès d’administration est réservé au responsable de Gomand Consult.</Li>
          </ul>
          <P>En cas de violation de données susceptible de vous nuire, nous vous en informons et prévenons l’APD dans les 72 heures.</P>

          <h2>9. Photos et contenus partagés</h2>
          <P>Les galeries photo peuvent montrer des personnes identifiables. Elles ne sont accessibles qu’aux personnes de votre entreprise qui ont un accès, et ne sont ni publiées ni utilisées à d’autres fins sans votre accord.</P>

          <h2>10. Modifications de cette politique</h2>
          <P>{`Cette politique peut évoluer. En cas de changement important, vous êtes invité à en prendre connaissance lors de votre prochaine connexion. Version ${PRIVACY_VERSION}.`}</P>
          <p><Link to="/connexion">Retour à la connexion</Link></p>
        </article>
      </div>
    </PublicShell>
  );
}
