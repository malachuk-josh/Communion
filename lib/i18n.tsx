"use client";

import { createContext, useContext, useEffect, useState } from "react";

export type Lang = "en" | "es";

const dictionaries = {
  en: {
    "app.tagline": "Read the Word. Gather in His name.",
    "nav.reader": "Reader",
    "nav.churches": "Churches",
    "reader.book": "Book",
    "reader.chapter": "Chapter",
    "reader.translation": "Translation",
    "reader.loading": "Loading Scripture…",
    "reader.error": "Could not load this chapter. Please try again.",
    "reader.prev": "Previous",
    "reader.next": "Next",
    "verse.matthew": "For where two or three are gathered together in my name, there am I in the midst of them.",
    "verse.matthewRef": "Matthew 18:20",
    "churches.title": "Your Churches",
    "churches.subtitle": "Small groups of believers, gathered in His name.",
    "churches.empty": "You haven't joined a Church yet. Found one and invite someone.",
    "churches.create": "Found a Church",
    "churches.name": "Church name",
    "churches.namePlaceholder": "e.g. Wednesday Night Fellowship",
    "churches.description": "Description (optional)",
    "churches.descriptionPlaceholder": "What gathers you together?",
    "churches.yourName": "Your name",
    "churches.members": "Members",
    "churches.founder": "Founder",
    "churches.invite": "Invite a believer",
    "churches.inviteText": "Share this link — it welcomes them straight into this Church. It expires in 7 days.",
    "churches.copyLink": "Copy link",
    "churches.copied": "Copied!",
    "churches.emailInvite": "Invite by email",
    "churches.messenger": "Send via Messenger",
    "churches.share": "Share…",
    "churches.upcoming": "Upcoming sessions",
    "churches.noSessions": "Nothing scheduled yet. Plan your first gathering.",
    "churches.schedule": "Schedule a session",
    "session.type": "What are you gathering for?",
    "session.bible_study": "Bible Study",
    "session.bible_study.desc": "Open the Word together",
    "session.prayer": "Prayer",
    "session.prayer.desc": "Intercede for one another",
    "session.communion": "Communion",
    "session.communion.desc": "Break bread in remembrance",
    "session.praise_worship": "Praise & Worship",
    "session.praise_worship.desc": "Lift His name together",
    "session.custom": "Custom",
    "session.custom.desc": "Something else on your heart",
    "session.title": "Title",
    "session.when": "When",
    "session.duration": "Duration (minutes)",
    "session.passage": "Passage (optional)",
    "session.passagePlaceholder": "e.g. John 3",
    "session.meetingUrl": "Meeting link (optional)",
    "session.meetingUrlPlaceholder": "Zoom, Meet, or a place to gather",
    "session.create": "Schedule",
    "session.cancel": "Cancel",
    "session.joinCall": "Join meeting",
    "rsvp.going": "Going",
    "rsvp.maybe": "Maybe",
    "rsvp.no": "Can't make it",
    "join.invited": "You're invited to",
    "join.accept": "Accept & join",
    "join.invalid": "This invite has expired or is not valid.",
    "join.by": "Invited by",
    "email.subject": "Join our Church on Communion",
    "email.body": "Grace and peace! I'd love for you to join {church} on Communion so we can read Scripture and worship together. Accept your invite here: {url}",
    "common.loading": "Loading…",
    "common.min": "min",
    "common.demoNotice": "Demo mode — sign-in and permanent storage activate once Clerk and Upstash are connected.",
  },
  es: {
    "app.tagline": "Lee la Palabra. Congrégate en Su nombre.",
    "nav.reader": "Lectura",
    "nav.churches": "Iglesias",
    "reader.book": "Libro",
    "reader.chapter": "Capítulo",
    "reader.translation": "Traducción",
    "reader.loading": "Cargando la Escritura…",
    "reader.error": "No se pudo cargar este capítulo. Inténtalo de nuevo.",
    "reader.prev": "Anterior",
    "reader.next": "Siguiente",
    "verse.matthew": "Porque donde están dos o tres congregados en mi nombre, allí estoy en medio de ellos.",
    "verse.matthewRef": "Mateo 18:20",
    "churches.title": "Tus Iglesias",
    "churches.subtitle": "Pequeños grupos de creyentes, congregados en Su nombre.",
    "churches.empty": "Aún no perteneces a una Iglesia. Funda una e invita a alguien.",
    "churches.create": "Fundar una Iglesia",
    "churches.name": "Nombre de la Iglesia",
    "churches.namePlaceholder": "p. ej. Comunión del Miércoles",
    "churches.description": "Descripción (opcional)",
    "churches.descriptionPlaceholder": "¿Qué los reúne?",
    "churches.yourName": "Tu nombre",
    "churches.members": "Miembros",
    "churches.founder": "Fundador",
    "churches.invite": "Invitar a un creyente",
    "churches.inviteText": "Comparte este enlace — les da la bienvenida directamente a esta Iglesia. Expira en 7 días.",
    "churches.copyLink": "Copiar enlace",
    "churches.copied": "¡Copiado!",
    "churches.emailInvite": "Invitar por correo",
    "churches.messenger": "Enviar por Messenger",
    "churches.share": "Compartir…",
    "churches.upcoming": "Próximas sesiones",
    "churches.noSessions": "Nada programado todavía. Planifica su primera reunión.",
    "churches.schedule": "Programar una sesión",
    "session.type": "¿Para qué se reúnen?",
    "session.bible_study": "Estudio Bíblico",
    "session.bible_study.desc": "Abran la Palabra juntos",
    "session.prayer": "Oración",
    "session.prayer.desc": "Intercedan unos por otros",
    "session.communion": "Santa Cena",
    "session.communion.desc": "Partan el pan en memoria de Él",
    "session.praise_worship": "Alabanza y Adoración",
    "session.praise_worship.desc": "Exalten Su nombre juntos",
    "session.custom": "Personalizado",
    "session.custom.desc": "Algo más en tu corazón",
    "session.title": "Título",
    "session.when": "Cuándo",
    "session.duration": "Duración (minutos)",
    "session.passage": "Pasaje (opcional)",
    "session.passagePlaceholder": "p. ej. Juan 3",
    "session.meetingUrl": "Enlace de reunión (opcional)",
    "session.meetingUrlPlaceholder": "Zoom, Meet, o un lugar para reunirse",
    "session.create": "Programar",
    "session.cancel": "Cancelar",
    "session.joinCall": "Unirse a la reunión",
    "rsvp.going": "Asistiré",
    "rsvp.maybe": "Quizás",
    "rsvp.no": "No puedo",
    "join.invited": "Estás invitado a",
    "join.accept": "Aceptar y unirse",
    "join.invalid": "Esta invitación ha expirado o no es válida.",
    "join.by": "Invitado por",
    "email.subject": "Únete a nuestra Iglesia en Communion",
    "email.body": "¡Gracia y paz! Me encantaría que te unieras a {church} en Communion para leer la Escritura y adorar juntos. Acepta tu invitación aquí: {url}",
    "common.loading": "Cargando…",
    "common.min": "min",
    "common.demoNotice": "Modo demo — el inicio de sesión y el almacenamiento permanente se activan al conectar Clerk y Upstash.",
  },
} as const;

export type MessageKey = keyof (typeof dictionaries)["en"];

interface I18nContextValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: MessageKey, vars?: Record<string, string>) => string;
}

const I18nContext = createContext<I18nContextValue>({
  lang: "en",
  setLang: () => {},
  t: (key) => dictionaries.en[key] ?? key,
});

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>("en");

  useEffect(() => {
    const saved = window.localStorage.getItem("communion.lang");
    if (saved === "en" || saved === "es") setLangState(saved);
  }, []);

  const setLang = (next: Lang) => {
    setLangState(next);
    window.localStorage.setItem("communion.lang", next);
    document.documentElement.lang = next;
  };

  const t = (key: MessageKey, vars?: Record<string, string>) => {
    let text: string = dictionaries[lang][key] ?? dictionaries.en[key] ?? key;
    if (vars) {
      for (const [k, v] of Object.entries(vars)) {
        text = text.replaceAll(`{${k}}`, v);
      }
    }
    return text;
  };

  return (
    <I18nContext.Provider value={{ lang, setLang, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n(): I18nContextValue {
  return useContext(I18nContext);
}
