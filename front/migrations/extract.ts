import fs from "fs";
import { pipeline } from "stream/promises";

import { FileStorage } from "@app/lib/file_storage";
import { makeScript } from "@app/scripts/helpers";

async function downloadGCSFiles({
  bucketName,
  fileIds,
  destinationFolder,
}: {
  bucketName: string;
  fileIds: string[];
  destinationFolder: string;
}) {
  // Create storage instance
  const storage = new FileStorage(bucketName);

  // Create destination folder if it doesn't exist
  fs.mkdirSync(destinationFolder, { recursive: true });

  // Download each file
  for (const fileId of fileIds) {
    try {
      const gcsFile = storage.file(fileId);
      const destPath = `${destinationFolder}/${fileId.split("/").pop()}`;

      await pipeline(
        gcsFile.createReadStream(),
        fs.createWriteStream(destPath)
      );

      console.log(`Downloaded ${fileId} to ${destPath}`);
    } catch (err) {
      if (err instanceof Error) {
        console.error(`Error downloading ${fileId}: ${err.message}`);
      }
    }
  }
}

makeScript({}, async () => {
  await downloadGCSFiles({
    bucketName: "dust-upsert-queue-prod",
    fileIds: [
      "a9cd8c71-cd00-4739-b890-14d19dd3eb7a.json",
      "ed9c48b9-d623-43b9-b83e-030ab710277f.json",
      "9548d616-b820-4229-a426-56419677e1bd.json",
      "894a7485-0f2d-4edf-bbe4-130592b2872b.json",
      "f3934260-134d-410d-8af1-5ca0d9da66cd.json",
      "d9951f55-16ca-4e98-88ed-d1cda3e7c1fb.json",
      "30714829-50a1-44a3-a51b-06b717d0ac29.json",
      "4a1fdcba-818c-4244-82ed-39cadceed685.json",
      "6be05b59-7462-47e7-82b8-de6eb646475e.json",
      "35a97179-dfa0-42a3-845f-0b437282b1b8.json",
      "aca67381-f489-443c-96f1-17d3995134ac.json",
      "f4174341-ae99-4524-95bd-63261b45a439.json",
      "10737e54-8330-45f5-a603-a96e68bc2cb2.json",
      "a9e7e4cb-dcb2-4431-88ce-d4d76f2c8f8f.json",
      "7ed952c2-5ec5-4e53-9882-b59e2f582a63.json",
      "a083ff04-1f4a-4e9e-baf1-a42c9456ea4e.json",
      "a1e3f7d8-a955-4b97-8992-837b70a9fad3.json",
      "cac845d4-af5e-4459-af67-099f57b3b778.json",
      "5163b50f-99a7-463f-9a4a-6091e238c53f.json",
      "4528f469-8ec9-43e8-bb33-f8eb459207c4.json",
      "ec8e7753-ec90-4083-8051-8d4085889dd5.json",
      "8bab12c1-f9c9-428e-a864-c43d622f6c6f.json",
      "bd37c3d6-a6d9-484d-8389-dab88b2271ed.json",
      "7dffffd1-af1b-491a-8607-435dc3bd0eb0.json",
      "bf3aa5e7-19ba-4883-b851-6066da4e66d9.json",
      "16bbd00c-7c62-403f-bfc0-b7e23e2f03e1.json",
      "423caea0-afd2-47ad-b289-9ad1401c64de.json",
      "14a57bcc-7204-4d21-aaa1-9df6f30a96e6.json",
      "e7346dd3-53f5-4dd3-bebd-13ef2def4630.json",
      "c36e58e8-5c58-40d2-aadf-29e172047198.json",
      "2f9ab178-5425-4bc6-ab7f-68a7f48e9783.json",
      "c133e070-39ac-4a51-bf20-46e02d5eeb85.json",
      "3ce48d70-f611-44e9-a13d-cc5e0fa84aab.json",
      "2af2447b-2ee6-4ced-b6c6-745db202f7ab.json",
      "6fd64d64-35fb-466f-ae3c-d447e325f362.json",
      "883b2403-026b-464e-af13-f5dfef971f7e.json",
      "66468318-ef01-4889-ac66-ee8509dcf2b1.json",
      "f611ac66-0d0e-43e9-9f72-8f4d79e21651.json",
      "941195cc-5d1b-41c2-ab5e-d85d48adc5f9.json",
      "f18e423d-b286-46db-98ac-68712272096f.json",
      "db8e48d1-2b8f-4591-a4e1-0093f2418374.json",
      "889809bb-03dd-4702-9f44-026e15601c26.json",
      "c172f8be-5458-4f2e-9c99-dc7196d46884.json",
      "8c7a4df0-8ce1-4f4f-a81b-288832435192.json",
      "dfd98203-b548-427e-8071-962ae7ded5f9.json",
      "ab49c6cf-771f-4915-852c-839dd221016f.json",
      "b1bd9366-2bc5-4859-9c6f-dd545ad40a90.json",
      "fb84aeee-f74c-4e93-8239-446348408783.json",
      "f4ab6aa7-bc21-4953-9e87-0bd98133e4a8.json",
      "b61dc0ce-74d8-4647-8e6a-4d4cceb292cd.json",
      "4a719867-8cb5-4f75-ac8e-b9f06d952f93.json",
      "1d1fd039-f353-4b74-b63b-a1fa3c1b9b2d.json",
      "330969c1-8a5a-4060-a85c-d4823d334cf5.json",
      "19d45657-985a-4da3-bc09-821909a2795b.json",
      "388957ac-33e3-492c-99ef-60f76fbebc33.json",
      "97995e5e-0dcc-4106-b866-1565af7c5ccd.json",
      "b526d79f-8f07-43be-b3e3-7520142feb5b.json",
      "05d45774-a5ce-4627-9de7-93aaaa43e529.json",
      "0a8064c8-fbe7-469e-8469-9730c77646d7.json",
      "1ee8cc3f-0cef-4e3e-a0f3-2b1c3b254a5c.json",
      "afa242c2-10ba-43f3-8976-945ecef6fdc8.json",
      "59d4390f-2655-417c-b3f7-c6a84b5ee07e.json",
      "0ca910d2-78be-43b2-be1e-b2de6c7ec867.json",
      "3e26d500-69cc-4be8-b9db-365bea123e4a.json",
      "0fb1cadc-3fda-4f67-b8a4-1f9c29f8c97e.json",
      "6b206c53-16fd-4d1b-8665-d851c5271538.json",
      "216fc8f6-b9be-49d2-ad34-6ebac0852a5e.json",
      "f50d30b2-d1b5-473e-be04-8c9abff10011.json",
      "31124f84-61ad-4be8-a136-10954cee4d54.json",
      "7ea465fb-fcbe-4b49-a482-c037de869355.json",
      "62f1ce34-4b62-4330-9a82-d2380cdc65bb.json",
      "2052786d-112c-41a7-b4b8-b55ff61bfb9b.json",
      "3d5186aa-3bf5-4de8-9dfd-e7b69aaf65d0.json",
      "8058f6e2-2e6b-43da-9a97-73a9147210a5.json",
      "d64ec63d-4b7a-421b-bddb-d45ee8188a32.json",
      "30160e2f-a4d2-4b3e-8d4f-4bb0b5bc0d13.json",
      "43048550-42d0-4069-ba1f-8c1ca741a14d.json",
      "d2bc9808-66ff-4cfe-b0e0-b92485be139b.json",
      "a9312fa8-79e2-4816-87b6-e0c0aa563c6b.json",
      "0581b149-6f39-469b-a345-d877386e0314.json",
      "9f1f157c-4b04-461e-b5aa-6bceaebce18f.json",
      "6cfbc679-f098-446b-8197-54ae12a294e3.json",
      "91333863-ac06-4ee3-a3a8-d9e0b54cc781.json",
      "de3a2baa-ce32-4692-9b68-765c3b6eb176.json",
      "f8dda44d-922e-4d17-a038-b25ca08621c2.json",
      "fdadaf66-e54b-4ad7-bb64-ff907408cad8.json",
      "a1daeda8-464e-4131-b87f-b73345b3bd15.json",
      "3a815330-887e-4701-9cd9-a00e8b5fd3ed.json",
      "f4753222-2181-46d6-a5ae-6e34726f9b21.json",
      "9f15f8b2-22d8-4ea2-95de-683ca3f601b8.json",
      "464b6523-5a5f-43f1-bb23-4c7b31bd69e3.json",
      "d4d31ae7-f4a7-4a85-adaf-b40cacdf7333.json",
      "e74d0e62-a7b2-4351-aa3c-9c6cfcd4dad5.json",
      "f8969503-74f4-43be-802b-42712d3ede04.json",
      "66f5af13-2e42-4df9-a69a-9994d6dc6478.json",
      "f94c7c4d-4dde-4a30-8baa-90d8286c10b8.json",
      "1cc3562a-4c14-4539-a496-fda96e01886f.json",
      "91d271f3-5f2b-450d-bd77-669e4be637f5.json",
      "c7770e9a-17f5-4819-b04d-358220bd6f07.json",
      "71f9f30c-926f-4f60-8e79-696aeb895252.json",
      "fc896cbd-fc2b-434a-896a-4ac2ce7bafd2.json",
      "e6949306-de3b-406f-92f6-6dc30d80958d.json",
      "47400f1c-86ea-461e-b579-123382967365.json",
      "6ed6eaf7-cefc-4665-ad0e-0d13f5615ed1.json",
      "c062b24e-e1c4-4ac9-a6b2-1936a7f7de82.json",
      "2f6a012c-51e8-48cd-b4dd-72837d79ae21.json",
      "bf0ac6b1-ae65-45fb-99bb-d2ecb6d6e81f.json",
      "db68587b-b38d-470b-9b1e-fbecaca40757.json",
      "b2689f4a-a766-40f3-a725-9941061270d9.json",
      "c63ec503-0130-4ca1-a200-9cec29fca502.json",
      "ff92ff0d-a299-44df-9930-2360223811a3.json",
      "9d5acb57-91b0-4167-9910-a5c9b6b1e0ee.json",
      "fc1a31a9-60c0-450b-bc43-d4e2ffb12ffd.json",
      "77b9f825-07ea-4576-b84f-5ea4ceb213fc.json",
      "b73c1574-fb55-4081-965b-2c10bec68b3d.json",
      "729d96f4-6938-4339-bb9c-a5c25699d5d0.json",
      "6e02b761-be1b-4992-a238-049192f5da2e.json",
      "5906a496-1f62-4373-804d-111d10666067.json",
      "0d3bc2c9-b4f7-48ce-8fb5-6240ec0ef281.json",
      "c3345e93-6e85-49f6-8d0b-739450ad811d.json",
      "fe05a82a-4f35-49e5-8749-d28db35b465d.json",
      "a155796d-5e90-44a6-bcc5-cb8feb6b4592.json",
      "da73ef41-f550-4ccf-aec2-22728e946b64.json",
      "e1cc2c56-20c6-409d-92bf-91d28f956eb8.json",
      "bca271bc-6135-42cc-abe6-d47b69dc552b.json",
      "eef8dfc5-d700-4fcf-b41f-91a9cbe9d38f.json",
      "11121646-de3e-4bce-8cbd-ec38a5018680.json",
      "f5746105-19c0-4910-a29f-99d02c9657d7.json",
      "ac07b031-80c2-4313-892f-599689b54d82.json",
      "b66b262f-2b12-480a-9b45-e68dbfec6133.json",
      "1ec91cbb-b6ed-4e6f-b2e9-26f6143dc0c2.json",
      "56dd08a5-769d-465c-8df4-7248fa193790.json",
      "507f93f7-744b-42fe-bbc5-cc3c51688dbb.json",
      "6729432c-5b3e-4dee-b908-17a50fcfe36d.json",
      "1da67136-8450-4d8b-85c6-e62fbba0da44.json",
      "9c8df0d2-9baf-477b-a2c2-5a63988212b2.json",
      "35dd07b2-df32-47e2-ac22-da8b48c6bb53.json",
      "93d94e0e-dbe3-429d-8731-45e7ef401747.json",
      "f3eab780-be74-4090-88f5-c5f89ffa8c04.json",
      "09782e50-da01-439c-b3e1-a9a880e737b9.json",
      "7e873d7f-e2a4-4e08-bc52-bb84316eab71.json",
      "651523ff-47df-42d8-8e06-7811f49e3d89.json",
      "9b9ddf29-737f-47af-a385-699981785d03.json",
      "f2c23f52-bcb6-4e7a-9141-7f6143c024a0.json",
      "bb403504-5956-480a-917e-902be19d90b3.json",
      "a72f5f87-bb57-4e22-96ac-e1be4d3bb6f7.json",
      "227c296f-05a8-4c3d-a045-13e04bc93cb8.json",
      "1b57c228-0f91-4a84-902a-29aed94c3196.json",
      "dab6f222-fd55-47fc-b531-ada5078289f0.json",
      "e439e1e7-397c-4cdf-9b7c-67ab96f9ec0e.json",
      "df965d03-5699-4c8f-a03b-e68ea6204239.json",
      "5aa86418-aa8f-47c8-8bc5-835d89b8e2d0.json",
      "4f022c77-1ac4-4975-ae27-3308c4be8fad.json",
    ],
    destinationFolder: "./watershed",
  });
});
