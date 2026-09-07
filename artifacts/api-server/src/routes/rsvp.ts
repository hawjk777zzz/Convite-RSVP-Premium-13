import { Router, type IRouter } from "express";
import type { RequestHandler } from "express";
import { desc, eq, sql } from "drizzle-orm";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import {
  eventSettingsTable,
  invitesTable,
  messagesTable,
  checkinsTable,
} from "@workspace/db";
import {
  CreateInviteBody,
  CreateMessageBody,
  CreateCheckinBody,
  DeleteInviteParams,
  GetInviteParams,
  RespondToInviteBody,
  RespondToInviteParams,
  UpdateEventBody,
  UpdateInviteBody,
  UpdateInviteParams,
  UpdateMessageBody,
  UpdateMessageParams,
} from "@workspace/api-zod";

const router: IRouter = Router();
const requireOrganizer: RequestHandler = (req, res, next) => {
  const auth = getAuth(req);
  if (!auth?.userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
};

const heroImage =
  "https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=1800&q=85";
const couplePortrait = "/images/antonio-aparecida.jpg";
const galleryImages = [
  {
    id: 1,
    imageUrl: "/images/antonio-aparecida-praia-1.jpg",
    alt: "Antônio e Aparecida caminhando de mãos dadas na praia",
  },
  {
    id: 2,
    imageUrl: "/images/antonio-aparecida-praia-2.jpg",
    alt: "Antônio e Aparecida juntos à beira-mar",
  },
  {
    id: 3,
    imageUrl: "/images/antonio-aparecida-praia-3.jpg",
    alt: "Antônio e Aparecida sorrindo no píer",
  },
];

const demoInvites = [
  {
    token: "x8k29guest01",
    name: "João e Maria",
    type: "couple",
    maxPeople: 2,
    allowCompanions: true,
    companionTypes: ["spouse", "family"],
    companions: [{ name: "Maria Silva", relation: "esposa" }],
    phone: "(11) 99999-1122",
    internalNotes: "Casal amigo dos anfitriões.",
    status: "confirmed",
    participants: [
      { name: "João Silva", kind: "Convidado principal" },
      { name: "Maria Silva", kind: "Acompanhante" },
    ],
    message: "Que essa história continue sendo cheia de amor e felicidade.",
  },
  {
    token: "familysilva82",
    name: "Família Silva",
    type: "family",
    maxPeople: 4,
    allowCompanions: true,
    companionTypes: ["family", "child"],
    companions: [
      { name: "Maria Silva", relation: "esposa" },
      { name: "Pedro Silva", relation: "filho" },
      { name: "Ana Silva", relation: "filha" },
    ],
    phone: "(11) 98888-2211",
    internalNotes: "",
    status: "pending",
    participants: [],
    message: null,
  },
  {
    token: "anaoliveira9",
    name: "Ana Oliveira",
    type: "individual",
    maxPeople: 1,
    allowCompanions: false,
    companionTypes: [],
    companions: [],
    phone: "(21) 97777-3344",
    internalNotes: "",
    status: "declined",
    participants: [],
    message: "Desejo muitos anos de felicidade para vocês.",
  },
  {
    token: "carlosbezerra",
    name: "Carlos Bezerra",
    type: "individual",
    maxPeople: 1,
    allowCompanions: false,
    companionTypes: [],
    companions: [],
    phone: null,
    internalNotes: "",
    status: "pending",
    participants: [],
    message: null,
  },
];

const goldenAnniversaryMessage =
  "Celebrando 50 anos de amor, companheirismo e memórias, queremos viver este momento ao lado de quem faz parte da nossa história.";
const goldenAnniversaryTimeline = [
  { id: 1, year: "1976", title: "O começo de tudo", description: "O início de uma vida inteira compartilhada." },
  { id: 2, year: "1988", title: "Uma família, muitos capítulos", description: "Sonhos, aprendizados e memórias construídos lado a lado." },
  { id: 3, year: "2005", title: "Caminhos que se multiplicaram", description: "A alegria de ver a nossa história florescer." },
  { id: 4, year: "2026", title: "50 anos juntos", description: "Uma celebração de amor, companheirismo e tudo o que ainda vamos viver." },
];

async function ensureSeeded() {
  const [event] = await db.select({ id: eventSettingsTable.id }).from(eventSettingsTable).limit(1);
  if (!event) {
    await db.insert(eventSettingsTable).values({
      couple: { name1: "Antônio", name2: "Aparecida", yearsTogether: 50, photoUrl: couplePortrait },
      eventDate: "2026-10-17",
      eventTime: "19:00",
      venue: "Casa das Palmeiras",
      address: "Alameda das Acácias, 240 — São Paulo, SP",
      heroImage,
      mapUrl: "https://maps.google.com/?q=Casa+das+Palmeiras+Sao+Paulo",
      message: goldenAnniversaryMessage,
      dressCode: "Traje social",
      timeline: goldenAnniversaryTimeline,
      gallery: galleryImages,
    });
  }

  const [currentEvent] = await db.select().from(eventSettingsTable).limit(1);
  const currentCouple = currentEvent?.couple as { name1?: string; name2?: string; yearsTogether?: number; photoUrl?: string } | undefined;
  const currentGallery = currentEvent?.gallery as Array<{ imageUrl?: string }> | undefined;
  if (currentEvent && currentCouple?.name1 === "Helena" && currentCouple?.name2 === "Marcelo" && currentEvent.eventDate === "2026-11-15") {
    await db.update(eventSettingsTable).set({
      couple: { ...(currentEvent.couple as Record<string, unknown>), name1: "Antônio", name2: "Aparecida", photoUrl: couplePortrait },
      eventDate: "2026-10-17",
      eventTime: "19:00",
    }).where(eq(eventSettingsTable.id, currentEvent.id));
  }
  if (currentEvent && currentGallery?.[0]?.imageUrl !== galleryImages[0].imageUrl) {
    await db.update(eventSettingsTable).set({ gallery: galleryImages }).where(eq(eventSettingsTable.id, currentEvent.id));
  }
  if (currentEvent && currentCouple?.yearsTogether === 28) {
    await db.update(eventSettingsTable).set({
      couple: { ...(currentEvent.couple as Record<string, unknown>), yearsTogether: 50 },
      message: goldenAnniversaryMessage,
      timeline: goldenAnniversaryTimeline,
    }).where(eq(eventSettingsTable.id, currentEvent.id));
  }

  const inviteCount = await db.select({ count: sql<number>`count(*)` }).from(invitesTable);
  if (Number(inviteCount[0]?.count ?? 0) === 0) {
    await db.insert(invitesTable).values(demoInvites);
  }

  const messageCount = await db.select({ count: sql<number>`count(*)` }).from(messagesTable);
  if (Number(messageCount[0]?.count ?? 0) === 0) {
    await db.insert(messagesTable).values([
      { author: "Marina e Paulo", message: "Que essa história continue sendo cheia de amor e felicidade.", status: "approved" },
      { author: "Renata Costa", message: "Parabéns por todos esses anos juntos. Será lindo celebrar com vocês.", status: "approved" },
      { author: "Felipe Andrade", message: "Vocês são inspiração para todos nós.", status: "pending" },
    ]);
  }
}

function normalizeInvite(invite: typeof invitesTable.$inferSelect) {
  return {
    token: invite.token,
    name: invite.name,
    type: invite.type,
    maxPeople: invite.maxPeople,
    allowCompanions: invite.allowCompanions,
    companionTypes: invite.companionTypes,
    companions: invite.companions,
    phone: invite.phone,
    internalNotes: invite.internalNotes,
    status: invite.status,
    respondedAt: invite.respondedAt?.toISOString() ?? null,
    message: invite.message,
    participants: invite.participants,
  };
}

router.get("/event", async (_req, res, next) => {
  try {
    await ensureSeeded();
    const [event] = await db.select().from(eventSettingsTable).limit(1);
    if (!event) {
      res.status(404).json({ error: "Event not found" });
      return;
    }
    res.json({
      couple: event.couple,
      eventDate: event.eventDate,
      eventTime: event.eventTime,
      venue: event.venue,
      address: event.address,
      heroImage: event.heroImage,
      mapUrl: event.mapUrl,
      message: event.message,
      dressCode: event.dressCode,
      timeline: event.timeline,
      gallery: event.gallery,
    });
  } catch (error) {
    next(error);
  }
});

router.get("/event/confirmed-participants", async (_req, res, next) => {
  try {
    await ensureSeeded();
    const invites = await db.select().from(invitesTable);
    const participants = invites
      .filter((invite) => invite.status === "confirmed")
      .flatMap((invite) => (Array.isArray(invite.participants) ? invite.participants : []));
    res.json({ participants });
  } catch (error) {
    next(error);
  }
});

router.put("/event", requireOrganizer, async (req, res, next) => {
  try {
    const body = UpdateEventBody.parse(req.body);
    const [existing] = await db.select({ id: eventSettingsTable.id }).from(eventSettingsTable).limit(1);
    if (!existing) {
      res.status(404).json({ error: "Event not found" });
      return;
    }
    const [event] = await db.update(eventSettingsTable).set(body).where(eq(eventSettingsTable.id, existing.id)).returning();
    if (!event) {
      res.status(404).json({ error: "Event not found" });
      return;
    }
    res.json({
      couple: event.couple,
      eventDate: event.eventDate,
      eventTime: event.eventTime,
      venue: event.venue,
      address: event.address,
      heroImage: event.heroImage,
      mapUrl: event.mapUrl,
      message: event.message,
      dressCode: event.dressCode,
      timeline: event.timeline,
      gallery: event.gallery,
    });
  } catch (error) {
    next(error);
  }
});

router.get("/invites", requireOrganizer, async (_req, res, next) => {
  try {
    await ensureSeeded();
    const invites = await db.select().from(invitesTable).orderBy(desc(invitesTable.createdAt));
    res.json(invites.map(normalizeInvite));
  } catch (error) {
    next(error);
  }
});

router.post("/invites", requireOrganizer, async (req, res, next) => {
  try {
    await ensureSeeded();
    const body = CreateInviteBody.parse(req.body);
    const maxCompanions = Math.max(0, body.maxPeople - 1);
    if (body.companions && body.companions.length > maxCompanions) {
      res.status(400).json({ error: "The companion list cannot exceed the invitation capacity" });
      return;
    }
    const token = `${body.name.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 10)}${Math.random().toString(36).slice(2, 8)}`;
    const [invite] = await db
      .insert(invitesTable)
      .values({
        ...body,
        token,
        companionTypes: body.companionTypes ?? [],
        companions: body.companions ?? [],
        internalNotes: body.internalNotes ?? "",
        status: "pending",
        participants: [],
      })
      .returning();
    res.status(201).json(normalizeInvite(invite));
  } catch (error) {
    next(error);
  }
});

router.get("/invites/:token", async (req, res, next) => {
  try {
    await ensureSeeded();
    const { token } = GetInviteParams.parse(req.params);
    const [invite] = await db.select().from(invitesTable).where(eq(invitesTable.token, token)).limit(1);
    if (!invite) {
      res.status(404).json({ error: "Invitation not found" });
      return;
    }
    res.json(normalizeInvite(invite));
  } catch (error) {
    next(error);
  }
});

router.patch("/invites/:token", requireOrganizer, async (req, res, next) => {
  try {
    const { token } = UpdateInviteParams.parse(req.params);
    const body = UpdateInviteBody.parse(req.body);
    const [currentInvite] = await db.select().from(invitesTable).where(eq(invitesTable.token, token)).limit(1);
    if (!currentInvite) {
      res.status(404).json({ error: "Invitation not found" });
      return;
    }
    const nextMaxPeople = body.maxPeople ?? currentInvite.maxPeople;
    if (body.companions && body.companions.length > Math.max(0, nextMaxPeople - 1)) {
      res.status(400).json({ error: "The companion list cannot exceed the invitation capacity" });
      return;
    }
    const invite = await db.update(invitesTable).set({
      ...body,
      companions: body.allowCompanions === false ? [] : body.companions,
    }).where(eq(invitesTable.token, token)).returning().then(([updated]) => updated);
    if (!invite) {
      res.status(404).json({ error: "Invitation not found" });
      return;
    }
    res.json(normalizeInvite(invite));
  } catch (error) {
    next(error);
  }
});

router.delete("/invites/:token", requireOrganizer, async (req, res, next) => {
  try {
    const { token } = DeleteInviteParams.parse(req.params);
    await db.delete(invitesTable).where(eq(invitesTable.token, token));
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

router.post("/invites/:token/response", async (req, res, next) => {
  try {
    const { token } = RespondToInviteParams.parse(req.params);
    const body = RespondToInviteBody.parse(req.body);
    const [currentInvite] = await db.select().from(invitesTable).where(eq(invitesTable.token, token)).limit(1);
    if (!currentInvite) {
      res.status(404).json({ error: "Invitation not found" });
      return;
    }
    if (body.status === "confirmed") {
      if (body.participants.some((participant) => !participant.name.trim())) {
        res.status(400).json({ error: "Every confirmed participant must have a name" });
        return;
      }
      if (body.participants.length === 0 || body.participants.length > currentInvite.maxPeople) {
        res.status(400).json({ error: "The confirmed participant count is invalid for this invitation" });
        return;
      }
      if (!currentInvite.allowCompanions && body.participants.length > 1) {
        res.status(400).json({ error: "This invitation does not allow companions" });
        return;
      }
    }
    const [invite] = await db
      .update(invitesTable)
      .set({
        status: body.status,
        participants: body.status === "declined" ? [] : body.participants,
        message: body.message ?? null,
        respondedAt: new Date(),
      })
      .where(eq(invitesTable.token, token))
      .returning();
    if (!invite) {
      res.status(404).json({ error: "Invitation not found" });
      return;
    }
    res.json(normalizeInvite(invite));
  } catch (error) {
    next(error);
  }
});

router.get("/dashboard/summary", requireOrganizer, async (_req, res, next) => {
  try {
    await ensureSeeded();
    const invites = await db.select().from(invitesTable);
    const confirmed = invites.filter((item) => item.status === "confirmed");
    const declined = invites.filter((item) => item.status === "declined");
    const pending = invites.filter((item) => item.status === "pending");
    const confirmedPeople = confirmed.reduce((total, invite) => total + (Array.isArray(invite.participants) ? invite.participants.length : 0), 0);
    res.json({
      totalInvites: invites.length,
      confirmedInvites: confirmed.length,
      declinedInvites: declined.length,
      pendingInvites: pending.length,
      confirmedPeople,
      confirmationTrend: [
        { date: "08 ago", count: 12 },
        { date: "15 ago", count: 18 },
        { date: "22 ago", count: 27 },
        { date: "29 ago", count: 33 },
        { date: "05 set", count: 41 },
      ],
      recentActivity: [
        { label: "João e Maria", detail: "confirmaram presença", time: "há 12 min" },
        { label: "Família Silva", detail: "abriu o convite", time: "há 38 min" },
        { label: "Renata Costa", detail: "deixou uma mensagem", time: "há 1 h" },
      ],
    });
  } catch (error) {
    next(error);
  }
});

router.get("/checkins", requireOrganizer, async (_req, res, next) => {
  try {
    await ensureSeeded();
    res.json(await db.select().from(checkinsTable).orderBy(desc(checkinsTable.checkedInAt)));
  } catch (error) {
    next(error);
  }
});

router.post("/checkins/:token", requireOrganizer, async (req, res, next) => {
  try {
    const { token } = GetInviteParams.parse(req.params);
    const body = CreateCheckinBody.parse(req.body);
    const [invite] = await db.select().from(invitesTable).where(eq(invitesTable.token, token)).limit(1);
    if (!invite) {
      res.status(404).json({ error: "Invitation not found" });
      return;
    }
    const [checkin] = await db.insert(checkinsTable).values({
      token,
      guestName: invite.name,
      confirmedPeople: Array.isArray(invite.participants) ? invite.participants.length : 0,
      presentPeople: body.presentPeople,
    }).returning();
    res.status(201).json(checkin);
  } catch (error) {
    next(error);
  }
});

router.get("/messages", requireOrganizer, async (_req, res, next) => {
  try {
    await ensureSeeded();
    const messages = await db.select().from(messagesTable).orderBy(desc(messagesTable.createdAt));
    res.json(messages);
  } catch (error) {
    next(error);
  }
});

router.post("/messages", async (req, res, next) => {
  try {
    const body = CreateMessageBody.parse(req.body);
    const [message] = await db.insert(messagesTable).values({
      author: body.author,
      message: body.message,
      status: "pending",
    }).returning();
    res.status(201).json(message);
  } catch (error) {
    next(error);
  }
});

router.patch("/messages/:id", requireOrganizer, async (req, res, next) => {
  try {
    const { id } = UpdateMessageParams.parse(req.params);
    const body = UpdateMessageBody.parse(req.body);
    const [message] = await db.update(messagesTable).set(body).where(eq(messagesTable.id, id)).returning();
    if (!message) {
      res.status(404).json({ error: "Message not found" });
      return;
    }
    res.json(message);
  } catch (error) {
    next(error);
  }
});

export default router;