import { boolean, date, integer, jsonb, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const eventSettingsTable = pgTable("event_settings", {
  id: serial("id").primaryKey(),
  couple: jsonb("couple").notNull(),
  eventDate: date("event_date", { mode: "string" }).notNull(),
  eventTime: text("event_time").notNull(),
  venue: text("venue").notNull(),
  address: text("address").notNull(),
  heroImage: text("hero_image").notNull(),
  mapUrl: text("map_url").notNull(),
  message: text("message").notNull(),
  dressCode: text("dress_code"),
  timeline: jsonb("timeline").notNull(),
  gallery: jsonb("gallery").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const invitesTable = pgTable("invites", {
  id: serial("id").primaryKey(),
  token: text("token").notNull().unique(),
  name: text("name").notNull(),
  type: text("type").notNull(),
  maxPeople: integer("max_people").notNull(),
  allowCompanions: boolean("allow_companions").notNull().default(false),
  companionTypes: text("companion_types").array().notNull().default([]),
  phone: text("phone"),
  status: text("status").notNull().default("pending"),
  respondedAt: timestamp("responded_at", { withTimezone: true }),
  message: text("message"),
  participants: jsonb("participants").notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const messagesTable = pgTable("guest_messages", {
  id: serial("id").primaryKey(),
  author: text("author").notNull(),
  message: text("message").notNull(),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const checkinsTable = pgTable("checkins", {
  id: serial("id").primaryKey(),
  token: text("token").notNull(),
  guestName: text("guest_name").notNull(),
  confirmedPeople: integer("confirmed_people").notNull(),
  presentPeople: integer("present_people").notNull(),
  checkedInAt: timestamp("checked_in_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertEventSettingsSchema = createInsertSchema(eventSettingsTable).omit({ id: true, updatedAt: true });
export const insertInviteSchema = createInsertSchema(invitesTable).omit({ id: true, createdAt: true, respondedAt: true });
export const insertMessageSchema = createInsertSchema(messagesTable).omit({ id: true, createdAt: true });
export const insertCheckinSchema = createInsertSchema(checkinsTable).omit({ id: true, checkedInAt: true });

export type EventSettings = z.infer<typeof insertEventSettingsSchema>;
export type Invite = typeof invitesTable.$inferSelect;
export type GuestMessage = typeof messagesTable.$inferSelect;
export type Checkin = typeof checkinsTable.$inferSelect;