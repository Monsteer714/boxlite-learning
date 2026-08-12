/**
 * BoxLite C SDK - Command execution with streaming output.
 */

#include "example_common.h"
#include <stdio.h>

static void output_callback(const char *text, int is_stderr, void *user_data) {
  (void)user_data;
  FILE *stream = is_stderr ? stderr : stdout;
  fprintf(stream, "%s", text ? text : "");
}

int main(void) {
  printf("BoxLite C API Example\n");
  printf("Version: %s\n\n", boxlite_version());
  
  printf("[DEBUG] : Title and Version printed\n\n");

  printf("[DEBUG] : ready to call create_runtime_or_exit()\n\n");
  
  CBoxliteRuntime *runtime = create_runtime_or_exit();

  printf("[DEBUG] : create_runtime_or_exit() called\n\n");

  if (runtime == NULL) {
    printf("[DEBUG] : create_runtime_or_exit() return null, return\n\n");
    return 1;
  }

  printf("[DEBUG] : ready to call create_alpine_box_or_exit()\n\n");

  CBoxHandle *box = create_alpine_box_or_exit(runtime);

  printf("[DEBUG] : create_alpine_box_or_exit() called\n\n");

  if (box == NULL) {  
    printf("[DEBUG] : create_alpine_box_or_exit() return null, return\n\n");

    boxlite_runtime_free(runtime);

    printf("[DEBUG] : boxlite_runtime_free() called\n\n");

    return 1;
  }

  const char *const ls_args[] = {"-alrt", "/"};
  const char *const ip_args[] = {"addr"};
  int exit_code = 0;
  CBoxliteError error = {0};

  printf("Command 1: ls -alrt /\n---\n");
  BoxliteErrorCode code =
      execute_and_wait(runtime, box, "/bin/ls", ls_args, 2, output_callback,
                       NULL, &exit_code, &error);
  if (code != Ok) {
    print_error("ls", &error);
    boxlite_error_free(&error);
  }
  printf("\nExit code: %d\n\n", exit_code);

  printf("Command 2: ip addr\n---\n");
  error = (CBoxliteError){0};
  exit_code = 0;
  code = execute_and_wait(runtime, box, "ip", ip_args, 1, output_callback, NULL,
                          &exit_code, &error);
  if (code != Ok) {
    print_error("ip addr", &error);
    boxlite_error_free(&error);
  }
  printf("\nExit code: %d\n\n", exit_code);

  printf("Command 3: env\n---\n");
  error = (CBoxliteError){0};
  exit_code = 0;
  code = execute_and_wait(runtime, box, "/usr/bin/env", NULL, 0,
                          output_callback, NULL, &exit_code, &error);
  if (code != Ok) {
    print_error("env", &error);
    boxlite_error_free(&error);
  }
  printf("\nExit code: %d\n", exit_code);

  char *id = boxlite_box_id(box);
  example_remove_box(runtime, id, 1, &error);
  boxlite_box_free(box);
  boxlite_free_string(id);
  boxlite_runtime_free(runtime);
  return 0;
}
