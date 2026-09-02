-- Tournament free-entry tickets ("بلیت رایگان").
-- Admin can issue a ticket to a user; the ticket pays the entry fee of one
-- paid tournament (either a specific one, or any paid tournament when
-- tournament_id IS NULL). Kept separate from `coupons` because coupons are
-- percent-discounts used by the Telegram bot flow, while a ticket fully
-- covers one registration on the website and is user-assigned.
CREATE TABLE IF NOT EXISTS tournament_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code varchar(20) NOT NULL UNIQUE,
  user_id uuid NOT NULL REFERENCES users(id),
  tournament_id uuid REFERENCES tournaments(id),
  max_uses integer NOT NULL DEFAULT 1,
  used_count integer NOT NULL DEFAULT 0,
  status varchar(20) NOT NULL DEFAULT 'active',
  note text,
  issued_by_id uuid REFERENCES users(id),
  expires_at timestamp,
  used_at timestamp,
  used_tournament_id uuid REFERENCES tournaments(id),
  used_registration_id uuid REFERENCES registrations(id),
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tournament_tickets_user_idx ON tournament_tickets(user_id);
CREATE INDEX IF NOT EXISTS tournament_tickets_status_idx ON tournament_tickets(status);
CREATE INDEX IF NOT EXISTS tournament_tickets_tournament_idx ON tournament_tickets(tournament_id);
