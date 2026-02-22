from app.services.agent import _load_promptdown_system_message


def test_loopie_prompt_includes_today_rollover_guidance() -> None:
    prompt = _load_promptdown_system_message("loopie.prompt.md")

    assert (
        "If a task is open on a past day and appears completed on a later "
        "day, count it as completed work." in prompt
    )
    assert (
        "If a past open task does not appear in later Today entries, treat "
        "it as potentially forgotten." in prompt
    )
    assert "Users can reference journal entries with canonical tokens like" in prompt
    assert (
        "prefer `read_journal_entry` with that referenced ID before summarizing"
        in prompt
    )
