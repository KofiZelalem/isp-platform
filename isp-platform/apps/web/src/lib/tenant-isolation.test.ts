import { createTenantClient, TenantIsolationError } from "database";
import { describe, expect, it } from "vitest";

function createOperationHarness(organizationId = "org-a") {
  let handler:
    | ((input: {
        model: string;
        operation: string;
        args: Record<string, unknown>;
        query: (args: unknown) => Promise<unknown>;
      }) => Promise<unknown>)
    | undefined;

  const prisma = {
    $extends(extension: {
      query: {
        $allModels: {
          $allOperations: typeof handler;
        };
      };
    }) {
      handler = extension.query.$allModels.$allOperations;
      return {
        __invoke(model: string, operation: string, args: Record<string, unknown>) {
          if (!handler) {
            throw new Error("Tenant operation handler was not initialized.");
          }

          return handler({
            model,
            operation,
            args,
            query: async (nextArgs) => nextArgs,
          });
        },
      };
    },
  };

  return createTenantClient(prisma as never, organizationId) as unknown as {
    __invoke(model: string, operation: string, args: Record<string, unknown>): Promise<unknown>;
  };
}

describe("createTenantClient", () => {
  it("adds the authenticated organization filter to tenant reads", async () => {
    const tenantDb = createOperationHarness("org-a");

    const result = (await tenantDb.__invoke("Subscriber", "findMany", {
      where: { organization_id: "org-b", username: "alice" },
    })) as {
      where: unknown;
    };

    expect(result.where).toEqual({
      AND: [{ organization_id: "org-b", username: "alice" }, { organization_id: "org-a" }],
    });
  });

  it("injects the authenticated organization into tenant creates", async () => {
    const tenantDb = createOperationHarness("org-a");

    const result = (await tenantDb.__invoke("Subscriber", "create", {
      data: { username: "alice" },
    })) as {
      data: { organization_id: string; username: string };
    };

    expect(result.data).toEqual({ organization_id: "org-a", username: "alice" });
  });

  it("rejects a write that tries to smuggle another organization_id", async () => {
    const tenantDb = createOperationHarness("org-a");

    await expect(
      tenantDb.__invoke("Subscriber", "create", {
        data: { organization_id: "org-b", username: "mallory" },
      })
    ).rejects.toBeInstanceOf(TenantIsolationError);
  });
});