import { startTransition, type FormEvent } from "react";

/**
 * Dispatches a form to a useActionState action without React's automatic form reset,
 * so an admin's input (selects, files, checkboxes) survives a validation error.
 * Server-side validation and authorization are unchanged.
 */
export function submitWithoutReset(dispatch: (fd: FormData) => void) {
  return (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const fd = new FormData(event.currentTarget, (event.nativeEvent as SubmitEvent).submitter);
    startTransition(() => dispatch(fd));
  };
}
