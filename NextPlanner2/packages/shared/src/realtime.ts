import { z } from "zod";

export const realtimeEventTypeSchema = z.enum([
  "plan.created",
  "plan.updated",
  "plan.deleted",
  "member.updated",
  "import.completed"
]);

export const realtimeEventSchema = z.object({
  type: realtimeEventTypeSchema,
  teamId: z.string().min(1),
  payload: z.record(z.unknown()),
  occurredAt: z.string().datetime({ offset: true })
});

export type RealtimeEventType = z.infer<typeof realtimeEventTypeSchema>;
export type RealtimeEventDto = z.infer<typeof realtimeEventSchema>;
