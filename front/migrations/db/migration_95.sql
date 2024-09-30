-- Migration created on Sep 28, 2024

CREATE OR REPLACE FUNCTION public.sqidsShuffle(alphabet TEXT) RETURNS TEXT AS $$
DECLARE
  chars TEXT[];
  i BIGINT;
  j BIGINT;
  r BIGINT;
  temp TEXT;
BEGIN
  chars := regexp_split_to_array(alphabet, '');
  i := 0;
  j := array_length(chars, 1) - 1;

  WHILE j > 0 LOOP
    r := (i * j + ascii(chars[i + 1]) + ascii(chars[j + 1])) % array_length(chars, 1);
    
    temp := chars[i + 1];
    chars[i + 1] := chars[r + 1];
    chars[r + 1] := temp;

    i := i + 1;
    j := j - 1;
  END LOOP;

  --raise notice 'Shuffled alphabet: %', array_to_string(chars, '');
  RETURN array_to_string(chars, '');
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.sqidsCheckAlphabet(alphabet TEXT) RETURNS BOOLEAN AS $$
DECLARE
  chars CHAR[];
  unique_chars CHAR[];
BEGIN
  IF LENGTH(alphabet) < 3 THEN
    RAISE EXCEPTION 'Alphabet must have at least 3 characters';
  END IF;

  -- IF POSITION(' ' IN alphabet) > 0 THEN
  --   RAISE EXCEPTION 'Alphabet must not contain spaces';
  -- END IF;

  IF octet_length(alphabet) <> length(alphabet) THEN
    RAISE EXCEPTION 'Alphabet must not contain multibyte characters';
  END IF;

  chars := regexp_split_to_array(alphabet, '');
  unique_chars := ARRAY(SELECT DISTINCT unnest(chars));
  IF array_length(chars, 1) <> array_length(unique_chars, 1) THEN
    RAISE EXCEPTION 'Alphabet must not contain duplicate characters';
  END IF;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;


CREATE OR REPLACE FUNCTION public.sqidsToNumber(id TEXT, alphabet TEXT) RETURNS BIGINT AS $$
DECLARE
  chars TEXT[];
  result BIGINT := 0;
  char TEXT;
  a BIGINT;
  v BIGINT;
BEGIN
  --raise notice 'id: %', id;
  --raise notice 'alphabet: %', alphabet;
  chars := regexp_split_to_array(alphabet, '');
  

  FOR i IN 1..length(id) LOOP
    char := substring(id from i for 1);
    --raise notice 'char: %', char;
    --raise notice 'result: %', result;
    --raise notice 'array_length(chars, 1): %', array_length(chars, 1);
    --raise notice 'array_position(chars, char): %', array_position(chars, char);
    result := result * array_length(chars, 1) + (array_position(chars, char) - 1);
  END LOOP;

  --raise notice 'tonumber result: %', result;
  RETURN result;
END;
$$ LANGUAGE plpgsql;


CREATE OR REPLACE FUNCTION public.sqidsDecode(id TEXT, alphabet TEXT DEFAULT 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789') RETURNS BIGINT[] AS $$
DECLARE
  ret BIGINT[];
  prefix TEXT;
  offset_var INT;
  i BIGINT;
  c TEXT;
  separator TEXT;
  chunks TEXT[];
  slicedId TEXT;
  num BIGINT;
BEGIN
  IF id = '' THEN
    ret := array[]::BIGINT[];
    RETURN ret;
  END IF;

  PERFORM sqidsCheckAlphabet(alphabet);

  FOR i IN 1..LENGTH(id) LOOP
    c := substring(id FROM i FOR 1);
    IF POSITION(c IN alphabet) = 0 THEN
      ret := array[]::BIGINT[];
      RETURN ret;
    END IF;
  END LOOP;

  alphabet := sqidsShuffle(alphabet);

  prefix := substring(id FROM 1 FOR 1);
  offset_var := POSITION(prefix IN alphabet) - 1;

  --raise notice 'prefix: %', prefix;
  --raise notice 'offset_var: %', offset_var;

  alphabet := substring(alphabet FROM offset_var + 1 FOR LENGTH(alphabet) - offset_var) || substring(alphabet FROM 1 FOR offset_var);

  alphabet := reverse(alphabet);
  --raise notice 'Alphabet: %', alphabet;
  slicedId := substring(id FROM 2);

  --raise notice 'Sliced ID: %', slicedId;

  WHILE LENGTH(slicedId) > 0 LOOP
    separator := substring(alphabet FROM 1 FOR 1);
    --raise notice 'Separator: %', separator;
    chunks := string_to_array(slicedId, separator);
    --raise notice 'Chunks: %', chunks;

    IF array_length(chunks, 1) > 0 THEN
      IF chunks[1] = '' THEN
        RETURN ret;
      END IF;

      num := sqidsToNumber(chunks[1], substring(alphabet FROM 2 FOR LENGTH(alphabet) - 1));
      ret := array_append(ret, num);

      IF array_length(chunks, 1) > 1 THEN
        alphabet := sqidsShuffle(alphabet);
      END IF;
    END IF;

    slicedId := array_to_string(chunks[2:], separator);
  END LOOP;

  RETURN ret;
END;
$$ LANGUAGE plpgsql;


CREATE OR REPLACE FUNCTION public.workspace_id_from_sid(sid TEXT)
RETURNS INTEGER AS $$
DECLARE
    decoded INTEGER[];
BEGIN
    -- Remove the prefix up to and including '_'
    sid := substring(sid from position('_' in sid) + 1);
    
    -- Decode the SID
    decoded := sqidsDecode(sid);
    
    -- Return the third item (workspaceId)
    RETURN decoded[3];
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION public.id_from_sid(sid TEXT)
RETURNS INTEGER AS $$
DECLARE
    decoded INTEGER[];
BEGIN
    -- Remove the prefix up to and including '_'
    sid := substring(sid from position('_' in sid) + 1);
    
    -- Decode the SID
    decoded := sqidsDecode(sid);
    
    -- Return the fourth item (resourceId)
    RETURN decoded[4];
END;
$$ LANGUAGE plpgsql IMMUTABLE;
