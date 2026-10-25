-- Keep configured titles and existing planning data. A fresh install is generic.
UPDATE wedding SET title='Collaborative planner'
WHERE title='Matías & Lisa' AND NOT EXISTS (SELECT 1 FROM activities);
