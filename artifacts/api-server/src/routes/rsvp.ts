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
const galleryImages = [
  {
    id: 1,
    imageUrl:
      "https://images.unsplash.com/photo-1511285560929-80b456fea0bc?auto=format&fit=crop&w=1200&q=85",
    alt: "Casal caminhando ao pôr do sol",
  },
  {
    id: 2,
    imageUrl:
      "https://images.unsplash.com/photo-1519225421980-715cb0215aed?auto=format&fit=crop&w=1200&q=85",
    alt: "Mesa preparada para uma celebração",
  },
  {
    id: 3,
    imageUrl:
      "https://images.unsplash.com/photo-1519741347686-c1e0aadf4611?auto=format&fit=crop&w=1200&q=85",
    alt: "Detalhe de mãos entrelaçadas",
  },
  {
    id: 4,
    imageUrl:
      "https://images.unsplash.com/photo-1469371670807-013ccf25f16a?auto=format&fit=crop&w=1200&q=85",
    alt: "Flores claras em uma mesa",
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
    phone: "(11) 99999-1122",
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
    phone: "(11) 98888-2211",
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
    phone: "(21) 97777-3344",
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
    phone: null,
    status: "pending",
    participants: [],
    message: null,
  },
];

async function ensureSeeded() {
  const [event] = await db.select({ id: eventSettingsTable.id }).from(eventSettingsTable).limit(1);
  if (!event) {
    await db.insert(eventSettingsTable).values({
      couple: { name1: "Helena", name2: "Marcelo", yearsTogether: 28 },
      eventDate: "2026-11-15",
      eventTime: "19:00",
      venue: "Casa das Palmeiras",
      address: "Alameda das Acácias, 240 — São Paulo, SP",
      heroImage,
      mapUrl: "https://maps.google.com/?q=Casa+das+Palmeiras+Sao+Paulo",
      message:
        "Se chegamos até aqui, foi porque tivemos a sorte de compartilhar nossa caminhada com pessoas especiais. E você faz parte dessa história. Por isso, será uma alegria enorme celebrar este momento ao seu lado.",
      dressCode: "Traje social",
      timeline: [
        { id: 1, year: "1998", title: "O começo de tudo", description: "Foi onde nossa história começou." },
        { id: 2, year: "2002", title: "O nosso casamento", description: "O dia em que dissemos sim." },
        { id: 3, year: "2005", title: "Construindo nossa família", description: "Momentos, sonhos e memórias." },
        { id: 4, year: "2026", title: "28 anos juntos", description: "E nossa história continua." },
      ],
      gallery: galleryImages,
    });
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
    phone: invite.phone,
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
    const token = `${body.name.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 10)}${Math.random().toString(36).slice(2, 8)}`;
    const [invite] = await db
      .insert(invitesTable)
      .values({ ...body, token, companionTypes: body.companionTypes ?? [], status: "pending", participants: [] })
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
    const [invite] = await db.update(invitesTable).set(body).where(eq(invitesTable.token, token)).returning();
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
    const [invite] = await db
      .update(invitesTable)
      .set({ status: body.status, participants: body.participants, message: body.message ?? null, respondedAt: new Date() })
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