/** @jest-environment jsdom */
// QA #2570 M18: legacy cardsGroup Bitbucket modal, Data Center submit and 400 handling.
import "@testing-library/jest-dom";
import { AxiosError } from "axios";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { BitbucketModal } from "src/core/components/system/cardsGroup/modals/bitbucket-token";

jest.mock("@components/ui/magic-modal", () => ({
    magicModal: { lock: jest.fn(), unlock: jest.fn(), hide: jest.fn() },
    useMagicModalState: () => ({ closeable: true }),
}));
jest.mock("@components/system/git-token-docs", () => ({ GitTokenDocs: () => null }));

it("sends Basic + host for Data Center and shows the 400", async () => {
    const err = new AxiosError("bad", "ERR", undefined, undefined, { status: 400 } as any);
    (err as any).status = 400;
    const onSave = jest.fn().mockRejectedValue(err);
    render(<BitbucketModal onSave={onSave} />);
    fireEvent.click(screen.getByText("Bitbucket Data Center").closest("button")!);
    fireEvent.change(screen.getByPlaceholderText(/Data Center username|username/i), { target: { value: "qa2570user" } });
    fireEvent.change(screen.getByPlaceholderText("Enter your Data Center password"), { target: { value: "pw" } });
    fireEvent.change(screen.getByPlaceholderText("https://bitbucket.your-company.com"), { target: { value: "https://dc.example.invalid" } });
    fireEvent.click(screen.getByText("Save Token").closest("button")!);
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    console.log("@@ONSAVE " + JSON.stringify(onSave.mock.calls[0]));
    await new Promise((r) => setTimeout(r, 50));
    console.log("@@ERRORTEXT " + JSON.stringify({ visible: !!screen.queryByText("Invalid Token or Username") }));
});
