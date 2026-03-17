function enrich_message(tag, timestamp, record)
    local event_type = record["event_type"]
    local command = record["command"]
    local pid = record["pid"]
    local exit_code = record["exit_code"]
    local msg = record["msg"] or record["message"]
    local data = record["data"]

    local severity_map = {
        process_start = "info",
        process_exit = "info",
        stdout = "info",
        stderr = "warn",
        error = "error",
        warning = "warn"
    }
    record["status"] = severity_map[event_type] or "info"

    if event_type == "process_exit" and exit_code then
        local code = tonumber(exit_code)
        if code and code ~= 0 then
            record["status"] = "error"
        end
    end

    record["conversation_id"] = os.getenv("CONVERSATION_ID")
    record["workspace_id"] = os.getenv("WORKSPACE_ID")

    if event_type == "process_start" and command then
        record["message"] = string.format("[pid:%s] Started: %s", pid or "?", command)
    elseif event_type == "process_exit" and command then
        record["message"] = string.format("[pid:%s] Exited (code %s): %s", pid or "?", exit_code or "?", command)
    elseif (event_type == "stdout" or event_type == "stderr") and data then
        record["message"] = string.format("[%s] %s", event_type, data)
    elseif event_type and msg then
        record["message"] = string.format("[%s] %s", event_type, msg)
    elseif msg then
        record["message"] = msg
    elseif command then
        record["message"] = command
    end

    return 2, timestamp, record
end
