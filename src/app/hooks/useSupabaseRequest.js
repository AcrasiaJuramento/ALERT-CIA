import { useCallback, useState } from "react";
import { formatSupabaseError } from "../services/supabase";

export function useSupabaseRequest(request, { initialData = null } = {}) {
  const [data, setData] = useState(initialData);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const execute = useCallback(async (...args) => {
    setLoading(true);
    setError("");
    try {
      const result = await request(...args);
      setData(result);
      return result;
    } catch (requestError) {
      const message = formatSupabaseError(requestError, "Request failed.");
      setError(message);
      throw requestError;
    } finally {
      setLoading(false);
    }
  }, [request]);

  return { data, setData, loading, error, execute };
}
