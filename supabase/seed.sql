-- Sprint 8: Initial 60 prompts
-- Run this in the Supabase SQL editor after running schema.sql and functions.sql

INSERT INTO prompts (text, status) VALUES
  -- Sensory Observation
  ('Draw a sound you can hear right now.', 'approved'),
  ('Draw something you can smell.', 'approved'),
  ('Draw the texture under your fingertips.', 'approved'),
  ('Draw what''s in your peripheral vision.', 'approved'),
  ('Draw a color you didn''t expect to see today.', 'approved'),
  ('Draw the loudest thing you''ve heard today.', 'approved'),
  ('Draw the quietest thing in this room.', 'approved'),
  ('Draw the temperature.', 'approved'),
  ('Draw what your hands are touching.', 'approved'),
  ('Draw the shape of a sound.', 'approved'),
  ('Draw the warmest spot you can find.', 'approved'),
  ('Draw something you only noticed because you stopped moving.', 'approved'),

  -- Hyperlocal NYC
  ('Draw something you''d find at the deli.', 'approved'),
  ('Draw something only locals would notice.', 'approved'),
  ('Draw the closest piece of trash to you.', 'approved'),
  ('Draw a window that isn''t yours.', 'approved'),
  ('Draw something you walk past every day without seeing.', 'approved'),
  ('Draw the sign on your nearest corner.', 'approved'),
  ('Draw a stranger''s hat.', 'approved'),
  ('Draw the inside of a bodega.', 'approved'),
  ('Draw the building across the street.', 'approved'),
  ('Draw what you can see from where you''re sitting.', 'approved'),
  ('Draw a piece of street art near you.', 'approved'),
  ('Draw something that''s been there longer than you.', 'approved'),

  -- Domestic and Personal
  ('Draw the thing on your desk you don''t need but won''t throw away.', 'approved'),
  ('Draw your favorite mug.', 'approved'),
  ('Draw what''s in your pocket.', 'approved'),
  ('Draw the food you ate most recently.', 'approved'),
  ('Draw a plant in your apartment.', 'approved'),
  ('Draw something you''ve owned for ten years.', 'approved'),
  ('Draw the first thing you touch in the morning.', 'approved'),
  ('Draw your most-used object today.', 'approved'),
  ('Draw the corner of your room.', 'approved'),
  ('Draw what''s on the floor right now.', 'approved'),

  -- Time and Weather
  ('Draw the sky right now.', 'approved'),
  ('Draw what time feels like today.', 'approved'),
  ('Draw the light coming through a window.', 'approved'),
  ('Draw a shadow.', 'approved'),
  ('Draw the weather without using clouds or sun.', 'approved'),
  ('Draw what season it actually feels like.', 'approved'),
  ('Draw the hour you most enjoyed today.', 'approved'),
  ('Draw the moon, even if you can''t see it.', 'approved'),

  -- Memory and Nostalgia
  ('Draw a place you used to go that''s gone now.', 'approved'),
  ('Draw something from a trip.', 'approved'),
  ('Draw a meal you remember from childhood.', 'approved'),
  ('Draw a friend''s face from memory.', 'approved'),
  ('Draw a room you don''t live in anymore.', 'approved'),
  ('Draw something you''ve lost.', 'approved'),
  ('Draw a smell that takes you somewhere else.', 'approved'),
  ('Draw a sound you''ll never hear again.', 'approved'),

  -- Whimsy and Play
  ('Draw a creature that doesn''t exist but should.', 'approved'),
  ('Draw something at the wrong scale.', 'approved'),
  ('Draw a tiny thing as big as you can.', 'approved'),
  ('Draw a face on something that doesn''t have one.', 'approved'),
  ('Draw what a pigeon is thinking.', 'approved'),
  ('Draw a small joke.', 'approved'),
  ('Draw the inside of an animal you''ll never see inside of.', 'approved'),
  ('Draw a door to somewhere unexpected.', 'approved'),
  ('Draw a thing that''s about to happen.', 'approved'),
  ('Draw something almost embarrassing.', 'approved');
