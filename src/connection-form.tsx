import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { randomUUID } from "node:crypto";
import {
  Action,
  ActionPanel,
  Form,
  showToast,
  Toast,
  useNavigation,
} from "@raycast/api";
import { useRef, useState } from "react";
import { isLoopback, type Connection, type MySqlConnection } from "./model";
import { storageError, update } from "./store";

type Values = {
  name: string;
  engine: Connection["engine"];
  host: string;
  port: string;
  database: string;
  user: string;
  password: string;
  tls: MySqlConnection["tls"];
  caPath: string;
  profile: string;
  region: string;
  workgroup: string;
  catalog: string;
  outputLocation: string;
};

function parse(values: Values, id: string): Connection {
  const name = values.name.trim();
  const database = values.database.trim();
  if (!name || !database) throw new Error("Enter a name and database.");
  if (values.engine === "mysql") {
    const host = values.host.trim();
    const user = values.user.trim();
    const port = Number(values.port);
    if (!host || !user) throw new Error("Enter a host and user.");
    if (
      !/^\d+$/.test(values.port.trim()) ||
      !Number.isInteger(port) ||
      port < 1 ||
      port > 65535
    ) {
      throw new Error("Enter a port from 1 to 65535.");
    }
    if (values.tls === "loopback" && !isLoopback(host)) {
      throw new Error("Use TLS for hosts outside this Mac.");
    }
    const caPath = values.caPath?.trim().replace(/^~\//, homedir() + "/");
    if (
      values.tls === "custom" &&
      (!caPath || !caPath.startsWith("/") || !existsSync(caPath))
    ) {
      throw new Error("Enter the path to a local CA certificate.");
    }
    return {
      id,
      name,
      database,
      engine: "mysql",
      host,
      user,
      port,
      password: values.password,
      tls: values.tls,
      caPath: values.tls === "custom" ? caPath : undefined,
    };
  }

  const profile = values.profile.trim();
  const region = values.region.trim();
  const workgroup = values.workgroup.trim();
  const catalog = values.catalog.trim();
  const outputLocation = values.outputLocation?.trim() || undefined;
  if (!profile || !region || !workgroup || !catalog) {
    throw new Error("Enter an AWS profile, region, workgroup, and catalog.");
  }
  if (outputLocation && !/^s3:\/\/[^/\s]+(?:\/[^\s]*)?$/.test(outputLocation)) {
    throw new Error("Use an S3 URI for the result location.");
  }
  return {
    id,
    name,
    database,
    engine: "athena",
    profile,
    region,
    workgroup,
    catalog,
    outputLocation,
  };
}

export function ConnectionForm({ existing }: { existing?: Connection }) {
  const { pop } = useNavigation();
  const [engine, setEngine] = useState<Connection["engine"]>(
    existing?.engine ?? "mysql",
  );
  const [tls, setTls] = useState<MySqlConnection["tls"]>(
    existing?.engine === "mysql" ? existing.tls : "system",
  );
  const [saving, setSaving] = useState(false);
  const submission = useRef(false);
  const mySql = existing?.engine === "mysql" ? existing : undefined;
  const athena = existing?.engine === "athena" ? existing : undefined;

  async function save(values: Values) {
    if (submission.current) return;
    let connection: Connection;
    try {
      connection = parse(
        { ...values, engine, tls },
        existing?.id ?? randomUUID(),
      );
    } catch (error) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Check connection details",
        message: String((error as Error).message),
      });
      return;
    }

    submission.current = true;
    setSaving(true);
    try {
      await update((state) => ({
        ...state,
        connections: existing
          ? state.connections.map((item) =>
              item.id === existing.id ? connection : item,
            )
          : [...state.connections, connection],
      }));
      pop();
    } catch {
      await storageError();
    } finally {
      submission.current = false;
      setSaving(false);
    }
  }

  return (
    <Form
      navigationTitle={existing ? "Edit Connection" : "Add Connection"}
      isLoading={saving}
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Save Connection" onSubmit={save} />
        </ActionPanel>
      }
    >
      <Form.TextField
        id="name"
        title="Name"
        defaultValue={existing?.name}
        placeholder="Development MySQL"
        autoFocus
      />
      {!existing && (
        <Form.Dropdown
          id="engine"
          title="Engine"
          value={engine}
          onChange={(value) => setEngine(value as Connection["engine"])}
        >
          <Form.Dropdown.Item value="mysql" title="MySQL" />
          <Form.Dropdown.Item value="athena" title="Amazon Athena" />
        </Form.Dropdown>
      )}
      {engine === "mysql" ? (
        <>
          <Form.TextField
            id="host"
            title="Host"
            defaultValue={mySql?.host}
            placeholder="db.example.com"
          />
          <Form.TextField
            id="port"
            title="Port"
            defaultValue={String(mySql?.port ?? 3306)}
          />
          <Form.TextField
            id="database"
            title="Database"
            defaultValue={mySql?.database}
          />
          <Form.TextField id="user" title="User" defaultValue={mySql?.user} />
          <Form.PasswordField
            id="password"
            title="Password"
            defaultValue={mySql?.password}
          />
          <Form.Dropdown
            id="tls"
            title="TLS"
            value={tls}
            onChange={(value) => setTls(value as MySqlConnection["tls"])}
          >
            <Form.Dropdown.Item value="system" title="Verify with System CAs" />
            <Form.Dropdown.Item value="custom" title="Verify with Custom CA" />
            <Form.Dropdown.Item value="loopback" title="Off for Loopback" />
          </Form.Dropdown>
          {tls === "custom" && (
            <Form.TextField
              id="caPath"
              title="CA Certificate Path"
              defaultValue={mySql?.caPath}
              placeholder="/path/to/ca.pem"
            />
          )}
        </>
      ) : (
        <>
          <Form.TextField
            id="profile"
            title="AWS Profile"
            defaultValue={athena?.profile ?? "default"}
          />
          <Form.TextField
            id="region"
            title="Region"
            defaultValue={athena?.region}
            placeholder="us-east-1"
          />
          <Form.TextField
            id="workgroup"
            title="Workgroup"
            defaultValue={athena?.workgroup ?? "primary"}
          />
          <Form.TextField
            id="catalog"
            title="Catalog"
            defaultValue={athena?.catalog ?? "AwsDataCatalog"}
          />
          <Form.TextField
            id="database"
            title="Database"
            defaultValue={athena?.database ?? "default"}
          />
          <Form.TextField
            id="outputLocation"
            title="S3 Results Location"
            defaultValue={athena?.outputLocation}
            placeholder="Optional if set by workgroup"
          />
        </>
      )}
    </Form>
  );
}
