-- What kind of device a Direction sign-in comes from (« Android · Chrome »), shown in « Vos connexions ».
ALTER TABLE sessions ADD COLUMN label TEXT;
