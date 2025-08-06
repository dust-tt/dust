import Foundation

class DustAPIClient {
  static let shared = DustAPIClient()

  private var baseURL: String {
    return AppConfig.dustBaseURL
  }
  private let session = URLSession.shared

  private init() {}

  // MARK: - Authentication

  private func createAuthenticatedRequest(
    for url: URL,
    apiKey: String,
    workspaceId: String? = nil
  ) -> URLRequest {
    var request = URLRequest(url: url)
    request.setValue("Bearer \(apiKey)", forHTTPHeaderField: "Authorization")
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.setValue("application/json", forHTTPHeaderField: "Accept")
    return request
  }

  private func handleAPIResponse(
    data: Data,
    response: URLResponse,
    errorMessage: String = "Request failed"
  ) throws -> Data {
    guard let httpResponse = response as? HTTPURLResponse else {
      throw DustAPIError.networkError
    }

    switch httpResponse.statusCode {
    case 200:
      return data
    case 401:
      throw DustAPIError.invalidCredentials
    case 429:
      throw DustAPIError(message: "Rate limit exceeded", statusCode: 429)
    default:
      throw DustAPIError(
        message: errorMessage,
        statusCode: httpResponse.statusCode
      )
    }
  }

  // MARK: - URL Building

  private func buildAPIURL(path: String) throws -> URL {
    let urlString = "\(baseURL)/api/v1/\(path)"
    guard let url = URL(string: urlString) else {
      throw DustAPIError(message: "Invalid URL: \(urlString)", statusCode: nil)
    }
    return url
  }

  // MARK: - API Calls

  func fetchSpaces(apiKey: String, workspaceId: String) async throws
    -> [DustSpace]
  {
    let url = try buildAPIURL(path: "w/\(workspaceId)/spaces")

    let request = createAuthenticatedRequest(
      for: url,
      apiKey: apiKey,
      workspaceId: workspaceId
    )

    do {
      let (data, response) = try await session.data(for: request)
      let validatedData = try handleAPIResponse(data: data, response: response)

      let spacesResponse = try JSONDecoder().decode(
        DustSpacesResponse.self,
        from: validatedData
      )
      return spacesResponse.spaces

    } catch let error as DustAPIError {
      throw error
    } catch {
      if error is DecodingError {
        throw DustAPIError.decodingError
      }
      throw DustAPIError.networkError
    }
  }

  func fetchDataSourceViews(
    apiKey: String,
    workspaceId: String,
    spaceId: String
  ) async throws -> [DustDataSourceView] {
    let url = try buildAPIURL(
      path: "w/\(workspaceId)/spaces/\(spaceId)/data_source_views"
    )

    let request = createAuthenticatedRequest(
      for: url,
      apiKey: apiKey,
      workspaceId: workspaceId
    )

    do {
      let (data, response) = try await session.data(for: request)
      let validatedData = try handleAPIResponse(data: data, response: response)

      let dataSourceViewsResponse = try JSONDecoder().decode(
        DustDataSourceViewsResponse.self,
        from: validatedData
      )
      // Filter to only return static data sources.
      return dataSourceViewsResponse.dataSourceViews.filter {
        $0.isFolder
      }

    } catch let error as DustAPIError {
      throw error
    } catch {
      if error is DecodingError {
        throw DustAPIError.decodingError
      }
      throw DustAPIError.networkError
    }
  }

  // MARK: - Transcript Upload

  func uploadTranscript(
    apiKey: String,
    workspaceId: String,
    spaceId: String,
    dataSourceId: String,
    documentId: String,
    audioData: Data
  ) async throws -> DustTranscriptUploadResponse {
    let url = try buildAPIURL(
      path:
        "w/\(workspaceId)/spaces/\(spaceId)/data_sources/\(dataSourceId)/documents/\(documentId)/transcript"
    )

    guard audioData.count <= AudioSettings.maxAudioFileSize else {
      throw DustAPIError(message: "File too large (max 25MB)", statusCode: nil)
    }

    guard !audioData.isEmpty else {
      throw DustAPIError(message: "Audio data is empty", statusCode: nil)
    }

    // Create multipart form data.
    let boundary = UUID().uuidString
    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    request.setValue("Bearer \(apiKey)", forHTTPHeaderField: "Authorization")
    request.setValue(
      "multipart/form-data; boundary=\(boundary)",
      forHTTPHeaderField: "Content-Type"
    )

    var body = Data()

    // Add audio file.
    body.append("--\(boundary)\r\n".data(using: .utf8)!)
    body.append(
      "Content-Disposition: form-data; name=\"audio\"; filename=\"\(documentId)\(AudioSettings.audioFileExtension)\"\r\n"
        .data(using: .utf8)!
    )
    body.append("Content-Type: audio/mp4\r\n\r\n".data(using: .utf8)!)
    body.append(audioData)
    body.append("\r\n".data(using: .utf8)!)

    // Close boundary.
    body.append("--\(boundary)--\r\n".data(using: .utf8)!)

    request.httpBody = body

    do {
      let (data, response) = try await session.data(for: request)
      let validatedData = try handleAPIResponse(
        data: data,
        response: response,
        errorMessage: "Upload failed"
      )

      let uploadResponse = try JSONDecoder().decode(
        DustTranscriptUploadResponse.self,
        from: validatedData
      )
      return uploadResponse

    } catch let error as DustAPIError {
      throw error
    } catch {
      if error is DecodingError {
        throw DustAPIError.decodingError
      }
      throw DustAPIError.networkError
    }
  }

  // MARK: - Combined Operations

  func fetchAvailableFolders(apiKey: String, workspaceId: String) async throws
    -> [DustFolder]
  {
    let spaces = try await fetchSpaces(apiKey: apiKey, workspaceId: workspaceId)

    var folders: [DustFolder] = []

    for space in spaces {
      do {
        let dataSourceViews = try await fetchDataSourceViews(
          apiKey: apiKey,
          workspaceId: workspaceId,
          spaceId: space.sId
        )

        // Convert data source views to folders (our own kind with only the stuff we need).
        let spaceFolders = dataSourceViews.map { dataSourceView in
          DustFolder(
            id: "\(space.sId)/\(dataSourceView.sId)",
            name: dataSourceView.name,
            spaceName: space.name,
            spaceId: space.sId,
            dataSourceId: dataSourceView.dataSource.sId
          )
        }

        folders.append(contentsOf: spaceFolders)
      } catch {
        print(
          "Failed to fetch data source views for space \(space.name): \(error)"
        )
      }
    }

    return folders.sorted { $0.displayName < $1.displayName }
  }
}
